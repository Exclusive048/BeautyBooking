import "server-only";

import { NotificationType, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import {
  EMPTY_ADMIN_AUDIT_CONTEXT,
  type AdminAuditContext,
} from "@/lib/audit/admin-audit-context";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";
import { logError, logInfo } from "@/lib/logging/logger";
import { dispatchAdminInitiatedNotification } from "@/lib/notifications/admin-initiated";
import { buildSubscriptionCancelledByAdminBody } from "@/lib/notifications/admin-body-templates";

type CancelInput = {
  adminUserId: string;
  subscriptionId: string;
  reason?: string | null;
  /** Request context (IP + User-Agent) captured at the route layer.
   * Service callers without a request should omit; defaults to the
   * empty context so audit rows stay non-null but unidentified. */
  context?: AdminAuditContext;
};

export class AdminCancelSubscriptionError extends Error {
  constructor(
    public readonly code:
      | "SUBSCRIPTION_NOT_FOUND"
      | "ALREADY_CANCELLED",
    message: string,
  ) {
    super(message);
    this.name = "AdminCancelSubscriptionError";
  }
}

/**
 * Admin-initiated subscription cancel. Mirrors the user-facing
 * `/api/billing/cancel` semantics: `cancelAtPeriodEnd: true`,
 * `autoRenew: false`, `cancelledAt: now`. The subscription keeps
 * `status: ACTIVE` (or `PAST_DUE`) until the cron sees
 * `cancelAtPeriodEnd: true` on period-end and flips it to
 * `CANCELLED` — user retains paid access until the period boundary.
 *
 * Transactional: subscription update + `BillingAuditLog` row in one
 * write. Plan cache invalidation happens outside the transaction
 * because it's best-effort (cache TTL is short enough that a partial
 * failure resolves itself).
 *
 * Notification uses the existing `BILLING_SUBSCRIPTION_CANCELLED`
 * type — there's no admin-specific value in the enum (BACKLOG item
 * for the dedicated `BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN`).
 */
export async function adminCancelSubscription(input: CancelInput): Promise<{
  subscriptionId: string;
  status: SubscriptionStatus;
}> {
  const subscription = await prisma.userSubscription.findUnique({
    where: { id: input.subscriptionId },
    select: {
      id: true,
      userId: true,
      scope: true,
      status: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
      plan: { select: { name: true, code: true } },
    },
  });

  if (!subscription) {
    throw new AdminCancelSubscriptionError(
      "SUBSCRIPTION_NOT_FOUND",
      "Подписка не найдена",
    );
  }
  if (
    subscription.status === SubscriptionStatus.CANCELLED ||
    subscription.status === SubscriptionStatus.EXPIRED ||
    subscription.cancelAtPeriodEnd
  ) {
    throw new AdminCancelSubscriptionError(
      "ALREADY_CANCELLED",
      "Подписка уже отменена",
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.userSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        autoRenew: false,
        cancelledAt: now,
      },
    });

    await createBillingAuditLog(
      {
        userId: subscription.userId,
        scope: subscription.scope,
        subscriptionId: subscription.id,
        action: "ADMIN_SUBSCRIPTION_CANCELLED",
        details: {
          adminUserId: input.adminUserId,
          previousStatus: subscription.status,
          planCode: subscription.plan.code,
          reason: input.reason?.trim() || null,
        },
      },
      tx,
    );

    await createAdminAuditLog({
      tx,
      adminUserId: input.adminUserId,
      action: "BILLING_SUBSCRIPTION_CANCELLED",
      targetType: "subscription",
      targetId: subscription.id,
      details: {
        userId: subscription.userId,
        planCode: subscription.plan.code,
        previousStatus: subscription.status,
        scope: subscription.scope,
      },
      reason: input.reason?.trim() || null,
      context: input.context ?? EMPTY_ADMIN_AUDIT_CONTEXT,
    });
  });

  // Best-effort: outside the transaction. Cache TTL is short so a
  // failure here just means subscribers see stale features for ≤5
  // minutes — preferable to rolling back the cancel.
  try {
    await invalidatePlanCache(subscription.userId, subscription.scope);
  } catch {
    // ignore — cache will expire on its own
  }

  try {
    await dispatchAdminInitiatedNotification({
      targetUserId: subscription.userId,
      type: NotificationType.BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN,
      title: "Подписка отменена администратором",
      body: buildSubscriptionCancelledByAdminBody({
        planName: subscription.plan.name,
        accessUntil: subscription.currentPeriodEnd,
        reason: input.reason ?? null,
      }),
      url: "/cabinet/billing",
      payload: {
        scope: subscription.scope,
        subscriptionId: subscription.id,
        planCode: subscription.plan.code,
      },
    });
  } catch (error) {
    logError("admin.billing.subscription.cancelled.notify_failed", {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logInfo("admin.billing.subscription.cancelled", {
    adminUserId: input.adminUserId,
    subscriptionId: subscription.id,
    userId: subscription.userId,
    previousStatus: subscription.status,
  });

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
  };
}
