import type { NotificationType, Prisma } from "@prisma/client";
import { billingUpgradeHref, type BillingScope } from "@/lib/billing/upgrade-href";
import { logError } from "@/lib/logging/logger";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { sendPushToUser } from "@/lib/notifications/push/send";

type BillingNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson?: Prisma.InputJsonValue;
  /**
   * The subscription scope this billing event concerns. When provided, the
   * push deep-link targets the scope-correct billing page (FIX-28 — threading
   * the scope the caller already knows). Omitted → bare `/cabinet/billing`,
   * which the route resolves by role (FIX-26 secondary).
   */
  scope?: BillingScope;
};

export async function createBillingNotification(input: BillingNotificationInput) {
  const record = await createNotification({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    // R2-06-F: persist the scope into the payload so the in-app notification
    // center renders a scope-correct CTA (`billingUpgradeHref`) the same way
    // the push deep-link already does (FIX-28).
    payloadJson: {
      ...((input.payloadJson as Record<string, unknown> | undefined) ?? {}),
      ...(input.scope ? { billingScope: input.scope } : {}),
    },
  });
  publishNotifications([record]);
  // HARDENING-01 FIX-4: fire-and-forget MUST carry a .catch — this helper runs
  // inside the worker (yookassa webhook job), where a rejected detached
  // promise triggers unhandledRejection → process.exit(1) and halts ALL
  // background jobs. Mirrors the existing pattern in `admin-initiated.ts`.
  void sendPushToUser(
    input.userId,
    {
      title: record.title,
      body: record.body,
      url: input.scope ? billingUpgradeHref(input.scope) : "/cabinet/billing",
    },
    // MOBILE-B2: решение «пушить ли в приложение» — в таблице
    // `native-push/payload.ts` (биллинг туда не уходит), а не здесь.
    { native: { type: record.type, notificationId: record.id, payloadJson: record.payloadJson } },
  ).catch((error) => {
    logError("Billing push notification delivery failed", {
      userId: input.userId,
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return record;
}
