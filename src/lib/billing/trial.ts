import { SubscriptionScope, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { ensureFreeSubscription } from "@/lib/billing/ensure-free-subscription";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";

/**
 * 30-day PREMIUM trial granted on first creation of a master/studio profile.
 *
 * Architectural invariant: `UserSubscription.@@unique([userId, scope])` allows
 * exactly one row per (user, scope). So:
 *   - Activation creates that single row pointing at the PREMIUM plan with
 *     `isTrial=true, trialEndsAt=now+30d`.
 *   - Expiry mutates the same row in place (planId → FREE, isTrial → false).
 *     We never delete-and-create — that would race against the unique key.
 *   - A user who has any prior PREMIUM-tier subscription on this scope
 *     (current or historical) is not eligible for trial again.
 */

export const TRIAL_DURATION_DAYS = 30;

export type TrialActivationReason =
  | "already-active"
  | "already-had-premium"
  | "premium-plan-not-found";

export type TrialActivationResult =
  | { ok: true; subscriptionId: string; trialEndsAt: Date }
  | { ok: false; reason: TrialActivationReason };

/**
 * Activates 30-day PREMIUM trial for a user on a given scope. Idempotent at
 * the row level (unique key prevents duplicates), and idempotent semantically
 * (callers can re-invoke; second call returns `already-active`).
 *
 * Wrapped in a single transaction so the eligibility checks and the create
 * happen atomically — two concurrent onboarding requests cannot both create
 * their own trial row.
 */
export async function activateTrialForNewProvider(
  userId: string,
  scope: SubscriptionScope,
): Promise<TrialActivationResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Already has any subscription for this scope?
    const existingActive = await tx.userSubscription.findUnique({
      where: { userId_scope: { userId, scope } },
      select: { id: true, planId: true, isTrial: true },
    });
    if (existingActive) {
      return { ok: false as const, reason: "already-active" as const };
    }

    // 2. Has the user EVER had a PREMIUM subscription for this scope?
    //    (the existence check above covers the case where it's still alive;
    //     this catches cancelled/expired premiums to prevent re-trialling).
    const everPremium = await tx.userSubscription.findFirst({
      where: { userId, scope, plan: { tier: "PREMIUM" } },
      select: { id: true },
    });
    if (everPremium) {
      return { ok: false as const, reason: "already-had-premium" as const };
    }

    // 3. Find the PREMIUM plan to point the trial subscription at.
    const premiumPlan = await tx.billingPlan.findFirst({
      where: { scope, tier: "PREMIUM", isActive: true },
      select: { id: true, code: true },
    });
    if (!premiumPlan) {
      return { ok: false as const, reason: "premium-plan-not-found" as const };
    }

    // 4. Create the trial row.
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const subscription = await tx.userSubscription.create({
      data: {
        userId,
        planId: premiumPlan.id,
        scope,
        status: SubscriptionStatus.ACTIVE,
        isTrial: true,
        trialEndsAt,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        periodMonths: 1,
        autoRenew: false,
        cancelAtPeriodEnd: false,
        nextBillingAt: null,
      },
      select: { id: true },
    });

    await createBillingAuditLog(
      {
        userId,
        scope,
        subscriptionId: subscription.id,
        action: "TRIAL_ACTIVATED",
        details: {
          planCode: premiumPlan.code,
          durationDays: TRIAL_DURATION_DAYS,
          trialEndsAt: trialEndsAt.toISOString(),
        },
      },
      tx,
    );

    return {
      ok: true as const,
      subscriptionId: subscription.id,
      trialEndsAt,
    };
  });
}

export type EnsureSubscriptionMode = "trial" | "existing" | "free-fallback";

export type EnsureSubscriptionResult = {
  mode: EnsureSubscriptionMode;
  subscriptionId?: string;
  trialEndsAt?: Date;
  fallbackReason?: TrialActivationReason;
};

/**
 * Drop-in replacement for `ensureFreeSubscription` at the point in profile
 * creation where a user *first* becomes a master/studio. Tries trial first,
 * falls back to FREE on any failure so the user is never left subscription-less.
 *
 * Called only from the "newly created" branch of createMasterProfile /
 * createStudioProfile — the "already-exists" branches keep using
 * ensureFreeSubscription directly because trial would be inappropriate there.
 */
export async function ensureFreeOrTrialSubscription(
  userId: string,
  scope: SubscriptionScope,
  source: string,
): Promise<EnsureSubscriptionResult> {
  const trialResult = await activateTrialForNewProvider(userId, scope).catch((error) => {
    logError("activateTrialForNewProvider threw", {
      userId,
      scope,
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (trialResult?.ok) {
    logInfo("Trial PREMIUM activated", {
      userId,
      scope,
      source,
      subscriptionId: trialResult.subscriptionId,
      trialEndsAt: trialResult.trialEndsAt.toISOString(),
    });
    await invalidatePlanCache(userId, scope);
    return {
      mode: "trial",
      subscriptionId: trialResult.subscriptionId,
      trialEndsAt: trialResult.trialEndsAt,
    };
  }

  if (trialResult?.ok === false && trialResult.reason === "already-active") {
    return { mode: "existing" };
  }

  // Fallback: ensure FREE so the user never lands without a subscription.
  const fallbackReason = trialResult?.ok === false ? trialResult.reason : undefined;
  await ensureFreeSubscription(userId, scope);
  logInfo("Trial fallback to FREE subscription", {
    userId,
    scope,
    source,
    reason: fallbackReason ?? "trial-threw",
  });
  return { mode: "free-fallback", fallbackReason };
}
