import { NotificationType, Prisma } from "@prisma/client";
import { logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { sendPushToUser } from "@/lib/notifications/push/send";
import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  truncatePushBody,
  truncatePushTitle,
} from "@/lib/notifications/admin-body-templates";
import { enqueue } from "@/lib/queue/queue";
import {
  createPlanEditedNotifyJob,
  createTelegramSendJob,
} from "@/lib/queue/types";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";

export { PUSH_BODY_MAX, PUSH_TITLE_MAX };

/** Union of admin-initiated notification types — narrower than the
 * full NotificationType enum so call sites can't accidentally route
 * generic events through this helper. */
export type AdminInitiatedNotificationType =
  | typeof NotificationType.BILLING_PLAN_GRANTED_BY_ADMIN
  | typeof NotificationType.BILLING_PLAN_EDITED
  | typeof NotificationType.BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN
  | typeof NotificationType.BILLING_PAYMENT_REFUNDED
  | typeof NotificationType.REVIEW_DELETED_BY_ADMIN
  | typeof NotificationType.SUBSCRIPTION_GRANTED_BY_ADMIN;

type DispatchInput = {
  targetUserId: string;
  type: AdminInitiatedNotificationType;
  title: string;
  body: string;
  /** Optional URL deep-link used by the push payload. Defaults to
   * `/cabinet/notifications` so the recipient can find context even
   * if a route-specific hint is missing. */
  url?: string;
  payload?: Prisma.InputJsonValue;
  /** Pass the transaction client when the in-app row must persist
   * atomically with the surrounding admin mutation. Push + Telegram
   * always dispatch outside the transaction (retry-able). */
  tx?: Prisma.TransactionClient;
};

/** Three-channel dispatcher: in-app + push + Telegram. The in-app
 * row is created synchronously (optionally inside `tx`). Push goes
 * fire-and-forget through the existing `sendPushToUser` helper.
 * Telegram is enqueued so VAPID / Telegram API outages don't surface
 * as 5xx to the admin acting on behalf of the recipient. */
export async function dispatchAdminInitiatedNotification(
  input: DispatchInput,
): Promise<void> {
  const record = await createNotification(
    {
      userId: input.targetUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      payloadJson: input.payload ?? {},
    },
    input.tx ?? prisma,
  );

  publishNotifications([record]);

  // Push delivery uses `sendPushToUser` fire-and-forget — same pattern
  // as `createBillingNotification` for regular subscription events.
  // Failures log inside the helper; we never want a missing push to
  // surface as a 5xx for the admin action.
  void sendPushToUser(input.targetUserId, {
    title: truncatePushTitle(input.title),
    body: truncatePushBody(input.body),
    url: input.url ?? "/cabinet/notifications",
  }).catch((error) => {
    logError("admin-initiated.push.failed", {
      type: input.type,
      userId: input.targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // Telegram via the existing `telegram.send` queue job — retry-able,
  // outside any transaction. The recipient resolution happens before
  // enqueue so we skip users without a linked + enabled Telegram chat.
  try {
    const chatId = await getTelegramChatIdForUser(input.targetUserId);
    if (chatId) {
      await enqueue(
        createTelegramSendJob({
          chatId,
          text: `${input.title}\n\n${input.body}`,
        }),
      );
    }
  } catch (error) {
    logError("admin-initiated.telegram.enqueue.failed", {
      type: input.type,
      userId: input.targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Fan-out wrapper for plan-edit notifications. Reads active
 * subscribers of the plan in 100-row batches and dispatches an
 * in-app + push + Telegram notification to each. Used by the worker
 * handler — never call directly from a route. */
export async function processPlanEditedMassNotification(payload: {
  planId: string;
  planCode: string;
  summary: string;
}): Promise<{ recipients: number; failures: number }> {
  const subs = await prisma.userSubscription.findMany({
    where: { planId: payload.planId, status: "ACTIVE" },
    select: { userId: true },
  });

  let failures = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < subs.length; i += BATCH_SIZE) {
    const batch = subs.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((sub) =>
        dispatchAdminInitiatedNotification({
          targetUserId: sub.userId,
          type: NotificationType.BILLING_PLAN_EDITED,
          title: "Изменения в вашем тарифе",
          body: payload.summary,
          url: "/cabinet/billing",
          payload: { planId: payload.planId, planCode: payload.planCode },
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        failures += 1;
        logError("admin-initiated.plan-edited.dispatch.failed", {
          planId: payload.planId,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    }
  }

  return { recipients: subs.length, failures };
}

/** Helper exported so admin routes can enqueue the mass dispatch
 * after a successful plan-edit commit. Returns void — the caller
 * should not block on enqueue success (queue infra has memory
 * fallback if Redis is briefly unavailable). */
export async function enqueuePlanEditedMassNotification(payload: {
  planId: string;
  planCode: string;
  summary: string;
}): Promise<void> {
  await enqueue(createPlanEditedNotifyJob(payload));
}
