import "server-only";

import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseOverrides,
  resolveEffectiveFeatures,
  type PlanNode,
} from "@/lib/billing/features";
import { planFeatureLines } from "@/features/admin-cabinet/billing/lib/feature-display";
import { isFeaturedTier } from "@/features/admin-cabinet/billing/lib/plan-display";
import type {
  AdminPlanCard,
  AdminPlanInheritanceCandidate,
  AdminPlanPrice,
} from "@/features/admin-cabinet/billing/types";

const ALLOWED_PERIODS = [1, 3, 6, 12] as const;
type AllowedPeriod = (typeof ALLOWED_PERIODS)[number];

function clampPeriod(months: number): AllowedPeriod | null {
  return ALLOWED_PERIODS.includes(months as AllowedPeriod)
    ? (months as AllowedPeriod)
    : null;
}

/** Pick the price-per-month rate used as the headline figure on a
 * plan card. Prefers the 1-month rate (apples-to-apples); falls back
 * to the smallest period available so a plan that's annual-only
 * still surfaces a sensible number. */
function pickPrimaryPerMonth(prices: AdminPlanPrice[]): number {
  const oneMonth = prices.find((p) => p.periodMonths === 1);
  if (oneMonth) return oneMonth.priceKopeks;
  if (prices.length === 0) return 0;
  const smallest = [...prices].sort(
    (a, b) => a.periodMonths - b.periodMonths,
  )[0]!;
  return Math.round(smallest.priceKopeks / smallest.periodMonths);
}

/**
 * Lists every billing plan for the admin grid, decorated with:
 *   - resolved features (inheritance chain applied)
 *   - active-subscription count
 *   - "primary" per-month price for the headline number
 *   - `isFeatured` flag for PREMIUM tier
 *
 * Two grouped queries, stitched in JS — no N+1 even with 6+ plans.
 * Sort: scope (MASTER first), then `sortOrder`, then `name`.
 */
export async function listAdminPlans(): Promise<AdminPlanCard[]> {
  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      features: true,
      sortOrder: true,
      inheritsFromPlanId: true,
      isActive: true,
      prices: {
        select: { periodMonths: true, priceKopeks: true, isActive: true },
        orderBy: { periodMonths: "asc" },
      },
    },
  });

  const counts = await prisma.userSubscription.groupBy({
    by: ["planId"],
    where: { status: SubscriptionStatus.ACTIVE },
    _count: { _all: true },
  });
  const countByPlan = new Map(counts.map((c) => [c.planId, c._count._all]));

  // Build a PlanNode map for inheritance resolution.
  const planNodes: Map<string, PlanNode> = new Map(
    plans.map((plan) => [
      plan.id,
      {
        id: plan.id,
        inheritsFromPlanId: plan.inheritsFromPlanId,
        features: plan.features,
      },
    ]),
  );

  return plans.map((plan) => {
    const effective = resolveEffectiveFeatures(plan.id, planNodes);
    const validPrices: AdminPlanPrice[] = plan.prices
      .map((p) => {
        const period = clampPeriod(p.periodMonths);
        if (period === null) return null;
        return {
          periodMonths: period,
          priceKopeks: p.priceKopeks,
          isActive: p.isActive,
        };
      })
      .filter((p): p is AdminPlanPrice => p !== null);

    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      tier: plan.tier,
      scope: plan.scope,
      features: planFeatureLines(effective, plan.scope),
      rawFeatures: parseOverrides(plan.features),
      inheritsFromPlanId: plan.inheritsFromPlanId ?? null,
      prices: validPrices,
      primaryPricePerMonthKopeks: pickPrimaryPerMonth(validPrices),
      activeSubscriptionsCount: countByPlan.get(plan.id) ?? 0,
      isFeatured: isFeaturedTier(plan.tier),
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
    };
  });
}

/** Light shape used by the features editor to render the
 * inheritance select and resolve `parentEffective`. One row per plan
 * in the system — small payload, single query. */
export async function listInheritanceCandidates(): Promise<AdminPlanInheritanceCandidate[]> {
  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      inheritsFromPlanId: true,
      features: true,
    },
  });
  return plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    tier: p.tier,
    scope: p.scope,
    inheritsFromPlanId: p.inheritsFromPlanId ?? null,
    rawFeatures: parseOverrides(p.features),
  }));
}

/**
 * Capture the "before" state of a plan for the BillingAuditLog diff.
 * Used by the PATCH route — we read this before applying changes,
 * then compare against the same shape after to record what moved.
 */
export async function snapshotPlanForAudit(planId: string): Promise<{
  name: string;
  isActive: boolean;
  sortOrder: number;
  prices: Array<{ periodMonths: number; priceKopeks: number; isActive: boolean }>;
  features: unknown;
} | null> {
  const plan = await prisma.billingPlan.findUnique({
    where: { id: planId },
    select: {
      name: true,
      isActive: true,
      sortOrder: true,
      features: true,
      prices: {
        select: { periodMonths: true, priceKopeks: true, isActive: true },
        orderBy: { periodMonths: "asc" },
      },
    },
  });
  if (!plan) return null;
  return {
    name: plan.name,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    features: plan.features,
    prices: plan.prices,
  };
}

/** Trim a parsed override map to keys present in the catalog —
 * defensive: keeps the audit-diff free of unknown keys that might
 * leak in from manual JSON edits. */
export function parseFeatureOverrides(raw: unknown) {
  return parseOverrides(raw);
}
