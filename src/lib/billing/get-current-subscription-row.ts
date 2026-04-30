import { cache } from "react";
import { SubscriptionScope, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Narrow read of the raw UserSubscription row for trial-aware UI surfaces
 * (badge, banner, conditional /pricing promo). Distinct from `getCurrentPlan`
 * which returns features-resolved data for feature gating — this one returns
 * the literal `isTrial` / `trialEndsAt` / `status` fields needed by the UI.
 *
 * Wrapped in `React.cache` so multiple components in the same RSC render
 * share one query (e.g. a layout reads it for the banner and the badge
 * computes its own state from the same row).
 */
export type SubscriptionRow = {
  id: string;
  scope: SubscriptionScope;
  status: SubscriptionStatus;
  isTrial: boolean;
  trialEndsAt: Date | null;
  planId: string;
  planTier: "FREE" | "PRO" | "PREMIUM";
};

export const getCurrentSubscriptionRow = cache(
  async (userId: string, scope: SubscriptionScope): Promise<SubscriptionRow | null> => {
    const sub = await prisma.userSubscription.findUnique({
      where: { userId_scope: { userId, scope } },
      select: {
        id: true,
        scope: true,
        status: true,
        isTrial: true,
        trialEndsAt: true,
        planId: true,
        plan: { select: { tier: true } },
      },
    });
    if (!sub) return null;
    return {
      id: sub.id,
      scope: sub.scope,
      status: sub.status,
      isTrial: sub.isTrial,
      trialEndsAt: sub.trialEndsAt,
      planId: sub.planId,
      planTier: sub.plan.tier,
    };
  },
);

/** Days remaining for an active trial; clamps at 0 (cron will downgrade soon). */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const diff = trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

/** Is this row an actively running trial right now? */
export function isActiveTrial(row: SubscriptionRow | null): row is SubscriptionRow & {
  isTrial: true;
  trialEndsAt: Date;
} {
  return Boolean(
    row && row.isTrial && row.trialEndsAt && row.status === SubscriptionStatus.ACTIVE,
  );
}
