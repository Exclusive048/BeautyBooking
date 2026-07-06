import { SubscriptionStatus, type SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";
import {
  sendTrialEndingSoonNotification,
  sendTrialExpiredNotification,
} from "@/lib/billing/notifications-trial";

/**
 * Trial-expiry processing — runs daily as part of /api/billing/renew/run.
 *
 * Two stages:
 *   1) Warn: send BILLING_TRIAL_ENDING_SOON to trials that end within
 *      WARNING_DAYS, exactly once per trial (gated by
 *      `trialEndingNotificationSentAt`).
 *   2) Downgrade: trials whose `trialEndsAt` has passed are mutated in place
 *      to FREE — the unique key on (userId, scope) forbids inserting a new
 *      row alongside, and the in-place mutation keeps history coherent
 *      (BillingAuditLog records the transition).
 *
 * Both stages process up to BATCH_SIZE rows per invocation. If real volume
 * outgrows that, the cron can be invoked more frequently or the limit raised.
 */

const WARNING_DAYS = 3;
const BATCH_SIZE = 100;

export type TrialExpirationsResult = {
  warned: number;
  warnErrors: number;
  downgraded: number;
  downgradeErrors: number;
};

export async function processTrialExpirations(now: Date = new Date()): Promise<TrialExpirationsResult> {
  let warned = 0;
  let warnErrors = 0;
  let downgraded = 0;
  let downgradeErrors = 0;

  // Stage 1 — warn upcoming expiries (dedup via trialEndingNotificationSentAt).
  const warningHorizon = new Date(now.getTime() + WARNING_DAYS * 24 * 60 * 60 * 1000);

  const expiringSoon = await prisma.userSubscription.findMany({
    where: {
      isTrial: true,
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: { gt: now, lte: warningHorizon },
      trialEndingNotificationSentAt: null,
    },
    select: { id: true, userId: true, scope: true, trialEndsAt: true },
    take: BATCH_SIZE,
  });

  for (const sub of expiringSoon) {
    try {
      const daysLeft = Math.max(
        1,
        Math.ceil(((sub.trialEndsAt?.getTime() ?? now.getTime()) - now.getTime()) / (24 * 60 * 60 * 1000)),
      );
      await sendTrialEndingSoonNotification({
        userId: sub.userId,
        scope: sub.scope,
        subscriptionId: sub.id,
        daysLeft,
        trialEndsAt: sub.trialEndsAt ?? now,
      });
      await prisma.userSubscription.update({
        where: { id: sub.id },
        data: { trialEndingNotificationSentAt: now },
      });
      warned += 1;
    } catch (error) {
      warnErrors += 1;
      logError("Trial warning failed", {
        subscriptionId: sub.id,
        userId: sub.userId,
        scope: sub.scope,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Stage 2 — downgrade expired trials in-place to FREE.
  const expired = await prisma.userSubscription.findMany({
    where: {
      isTrial: true,
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: { lte: now },
    },
    select: { id: true, userId: true, scope: true, planId: true },
    take: BATCH_SIZE,
  });

  for (const sub of expired) {
    try {
      const outcome = await downgradeTrialToFree(
        { subscriptionId: sub.id, userId: sub.userId, scope: sub.scope },
        now,
      );
      if (outcome === "downgraded") downgraded += 1;
    } catch (error) {
      downgradeErrors += 1;
      logError("Trial downgrade failed", {
        subscriptionId: sub.id,
        userId: sub.userId,
        scope: sub.scope,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (warned > 0 || downgraded > 0 || warnErrors > 0 || downgradeErrors > 0) {
    logInfo("Trial expirations processed", { warned, warnErrors, downgraded, downgradeErrors });
  }

  return { warned, warnErrors, downgraded, downgradeErrors };
}

type DowngradeArgs = {
  subscriptionId: string;
  userId: string;
  scope: SubscriptionScope;
};

type DowngradeOutcome = "downgraded" | "skipped-not-trial" | "skipped-paid-evidence";

/**
 * In-place mutation of a trial subscription to FREE.
 *
 * Rationale: `UserSubscription.@@unique([userId, scope])` forbids inserting a
 * separate FREE row alongside an EXPIRED trial. We mutate the same row —
 * planId/isTrial/status/period fields — and write a BillingAuditLog entry so
 * the trial→free transition is queryable historically.
 *
 * HARDENING-01 FIX-1 (defense-in-depth): the cron must be structurally unable
 * to downgrade a PAYING subscriber even when trial flags are inconsistent
 * (e.g. rows converted before the success webhook started clearing
 * `isTrial`). Evidence of successful payment — `lastPaymentAt` set, or a
 * paid-tier plan with a current (future) period — skips the row with a
 * warning instead of wiping it to FREE.
 *
 * Throws when the FREE plan is missing for the scope (caller logs and
 * continues to next subscription so one bad scope doesn't kill the batch).
 */
async function downgradeTrialToFree(args: DowngradeArgs, now: Date): Promise<DowngradeOutcome> {
  const outcome = await prisma.$transaction(async (tx): Promise<DowngradeOutcome> => {
    const trial = await tx.userSubscription.findUnique({
      where: { id: args.subscriptionId },
      select: {
        id: true,
        isTrial: true,
        planId: true,
        scope: true,
        userId: true,
        lastPaymentAt: true,
        currentPeriodEnd: true,
        plan: { select: { tier: true } },
      },
    });
    if (!trial || !trial.isTrial) return "skipped-not-trial";

    const hasSuccessfulPayment = trial.lastPaymentAt !== null;
    // A genuine trial's currentPeriodEnd equals trialEndsAt (<= now when the
    // cron selects it), so a FUTURE period on a paid tier only exists after a
    // real payment re-anchored it.
    const paidCurrentPeriod =
      trial.plan.tier !== "FREE" && trial.currentPeriodEnd !== null && trial.currentPeriodEnd > now;

    if (hasSuccessfulPayment || paidCurrentPeriod) {
      // Warning-level: flags are inconsistent with payment evidence — this
      // must not happen once FIX-1 clearing + the backfill script have run.
      logError("Trial downgrade skipped: subscription has payment evidence", {
        subscriptionId: trial.id,
        userId: trial.userId,
        scope: trial.scope,
        lastPaymentAt: trial.lastPaymentAt?.toISOString() ?? null,
        currentPeriodEnd: trial.currentPeriodEnd?.toISOString() ?? null,
        planTier: trial.plan.tier,
      });
      return "skipped-paid-evidence";
    }

    const freePlan = await tx.billingPlan.findFirst({
      where: { scope: trial.scope, tier: "FREE", isActive: true },
      select: { id: true, code: true },
    });
    if (!freePlan) {
      throw new Error(`FREE plan missing for scope ${trial.scope}`);
    }

    await tx.userSubscription.update({
      where: { id: trial.id },
      data: {
        planId: freePlan.id,
        isTrial: false,
        trialEndsAt: null,
        trialEndingNotificationSentAt: null,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        periodMonths: 1,
        autoRenew: false,
        cancelAtPeriodEnd: false,
        nextBillingAt: null,
      },
    });

    await createBillingAuditLog(
      {
        userId: trial.userId,
        scope: trial.scope,
        subscriptionId: trial.id,
        action: "TRIAL_DOWNGRADED_TO_FREE",
        details: {
          previousPlanId: trial.planId,
          newPlanCode: freePlan.code,
        },
      },
      tx,
    );

    return "downgraded";
  });

  // Cache invalidation + the "trial expired" notification only make sense
  // when the row was actually downgraded — a skipped row keeps its (paid or
  // already-converted) state and must not receive a bogus expiry notice.
  if (outcome !== "downgraded") return outcome;

  await invalidatePlanCache(args.userId, args.scope);

  // Notification fires after the DB transaction commits — the user might
  // briefly see PREMIUM features one more time, but the billing system is
  // authoritatively on FREE before we tell them.
  await sendTrialExpiredNotification({
    userId: args.userId,
    scope: args.scope,
    subscriptionId: args.subscriptionId,
  }).catch((error) => {
    logError("sendTrialExpiredNotification failed", {
      subscriptionId: args.subscriptionId,
      userId: args.userId,
      scope: args.scope,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return outcome;
}
