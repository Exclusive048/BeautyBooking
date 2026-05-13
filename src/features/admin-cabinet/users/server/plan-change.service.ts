import "server-only";

import { NotificationType, SubscriptionStatus, type UserSubscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import {
  EMPTY_ADMIN_AUDIT_CONTEXT,
  type AdminAuditContext,
} from "@/lib/audit/admin-audit-context";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { logError, logInfo } from "@/lib/logging/logger";
import { dispatchAdminInitiatedNotification } from "@/lib/notifications/admin-initiated";
import { buildPlanGrantedBody } from "@/lib/notifications/admin-body-templates";

type ChangePlanInput = {
  adminUserId: string;
  targetUserId: string;
  planCode: string;
  periodMonths: 1 | 3 | 6 | 12;
  /** Optional admin note — stored in BillingAuditLog.details.reason
   * so an audit reviewer can later understand why the plan was
   * granted (e.g. "compensation for technical issue"). */
  reason?: string | null;
  /** Request context (IP + User-Agent) captured at the route layer. */
  context?: AdminAuditContext;
};

export class AdminPlanChangeError extends Error {
  constructor(
    public readonly code:
      | "USER_NOT_FOUND"
      | "PLAN_NOT_FOUND"
      | "INVALID_PERIOD",
    message: string,
  ) {
    super(message);
    this.name = "AdminPlanChangeError";
  }
}

const ALLOWED_PERIODS = [1, 3, 6, 12] as const;

/**
 * Admin-bypass plan change. Upserts the user's subscription for the
 * plan's scope, marks it as a manual grant (autoRenew: false), and
 * records an entry in BillingAuditLog. NotificationType for "plan
 * granted by admin" doesn't exist in the enum yet (see BACKLOG —
 * 🟠 high priority); we record via `logInfo` for now and add the
 * notification in a follow-up commit alongside the enum migration.
 *
 * All side-effects wrapped in a single transaction so a failure
 * partway through doesn't leave a subscription updated without an
 * audit entry.
 */
export async function adminChangeUserPlan(
  input: ChangePlanInput,
): Promise<UserSubscription> {
  if (!ALLOWED_PERIODS.includes(input.periodMonths as 1 | 3 | 6 | 12)) {
    throw new AdminPlanChangeError(
      "INVALID_PERIOD",
      "Period must be 1, 3, 6, or 12 months",
    );
  }

  const [user, plan] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    }),
    prisma.billingPlan.findUnique({
      where: { code: input.planCode },
      select: { id: true, code: true, name: true, tier: true, scope: true },
    }),
  ]);

  if (!user) {
    throw new AdminPlanChangeError("USER_NOT_FOUND", "Пользователь не найден");
  }
  if (!plan) {
    throw new AdminPlanChangeError("PLAN_NOT_FOUND", "Тариф не найден");
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + input.periodMonths);

  const updated = await prisma.$transaction(async (tx) => {
    const previous = await tx.userSubscription.findUnique({
      where: {
        userId_scope: {
          userId: input.targetUserId,
          scope: plan.scope,
        },
      },
      select: {
        id: true,
        plan: { select: { code: true, tier: true } },
        status: true,
        periodMonths: true,
      },
    });

    const subscription = await tx.userSubscription.upsert({
      where: {
        userId_scope: {
          userId: input.targetUserId,
          scope: plan.scope,
        },
      },
      create: {
        userId: input.targetUserId,
        scope: plan.scope,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        periodMonths: input.periodMonths,
        // Admin-granted plans should not auto-charge later. The
        // existing renewal cron treats `autoRenew: false` as a signal
        // to downgrade to FREE at period-end rather than billing the
        // user — which is what we want for a manual grant.
        autoRenew: false,
        cancelAtPeriodEnd: false,
        isTrial: false,
        trialEndsAt: null,
      },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        periodMonths: input.periodMonths,
        autoRenew: false,
        cancelAtPeriodEnd: false,
        isTrial: false,
        trialEndsAt: null,
        trialEndingNotificationSentAt: null,
      },
    });

    await createBillingAuditLog(
      {
        userId: input.targetUserId,
        scope: plan.scope,
        subscriptionId: subscription.id,
        action: "ADMIN_PLAN_CHANGE",
        details: {
          adminUserId: input.adminUserId,
          previousPlanCode: previous?.plan.code ?? null,
          previousTier: previous?.plan.tier ?? null,
          previousStatus: previous?.status ?? null,
          previousPeriodMonths: previous?.periodMonths ?? null,
          newPlanCode: plan.code,
          newTier: plan.tier,
          newScope: plan.scope,
          newPeriodMonths: input.periodMonths,
          newPeriodEnd: periodEnd.toISOString(),
          reason: input.reason?.trim() || null,
        },
      },
      tx,
    );

    await createAdminAuditLog({
      tx,
      adminUserId: input.adminUserId,
      action: "USER_PLAN_GRANTED",
      targetType: "user",
      targetId: input.targetUserId,
      details: {
        subscriptionId: subscription.id,
        scope: plan.scope,
        previousPlanCode: previous?.plan.code ?? null,
        previousTier: previous?.plan.tier ?? null,
        previousStatus: previous?.status ?? null,
        previousPeriodMonths: previous?.periodMonths ?? null,
        newPlanCode: plan.code,
        newTier: plan.tier,
        newPeriodMonths: input.periodMonths,
        newPeriodEnd: periodEnd.toISOString(),
      },
      reason: input.reason?.trim() || null,
      context: input.context ?? EMPTY_ADMIN_AUDIT_CONTEXT,
    });

    return subscription;
  });

  // Logged outside the transaction so audit-row creation is the source
  // of truth; the structured log is just operational telemetry.
  logInfo("admin.users.plan.changed", {
    adminUserId: input.adminUserId,
    targetUserId: input.targetUserId,
    planCode: plan.code,
    periodMonths: input.periodMonths,
    reason: input.reason?.trim() || null,
  });

  // Notify recipient: in-app + push + Telegram. Dispatched outside
  // the transaction — failure here logs but doesn't undo the plan
  // grant (consistent with existing `createBillingNotification`
  // semantics for cancel-subscription).
  try {
    await dispatchAdminInitiatedNotification({
      targetUserId: input.targetUserId,
      type: NotificationType.BILLING_PLAN_GRANTED_BY_ADMIN,
      title: "Администратор изменил ваш тариф",
      body: buildPlanGrantedBody({
        planName: plan.name,
        periodMonths: input.periodMonths,
        reason: input.reason ?? null,
      }),
      url: "/cabinet/billing",
      payload: {
        planId: plan.id,
        planCode: plan.code,
        periodMonths: input.periodMonths,
        scope: plan.scope,
      },
    });
  } catch (error) {
    logError("admin.users.plan.changed.notify_failed", {
      adminUserId: input.adminUserId,
      targetUserId: input.targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return updated;
}
