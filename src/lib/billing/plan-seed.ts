import { Prisma, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PlanFeatureOverrides, PlanTier } from "@/lib/billing/features";
import { BILLING_PERIODS } from "@/lib/billing/constants";

const DEFAULT_PLANS: Array<{
  code: string;
  name: string;
  monthlyPriceKopeks: number;
  tier: PlanTier;
  scope: SubscriptionScope;
  features: PlanFeatureOverrides;
  sortOrder: number;
  inheritsFrom: string | null;
}> = [
  {
    code: "MASTER_FREE",
    name: "MASTER FREE",
    monthlyPriceKopeks: 0,
    tier: "FREE",
    scope: SubscriptionScope.MASTER,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      analytics_dashboard: true,
    },
    sortOrder: 0,
    inheritsFrom: null,
  },
  {
    code: "MASTER_PRO",
    name: "MASTER PRO",
    monthlyPriceKopeks: 60000,
    tier: "PRO",
    scope: SubscriptionScope.MASTER,
    features: {
      analytics_revenue: true,
      analytics_clients: true,
    },
    sortOrder: 10,
    inheritsFrom: "MASTER_FREE",
  },
  {
    code: "MASTER_PREMIUM",
    name: "MASTER PREMIUM",
    monthlyPriceKopeks: 150000,
    tier: "PREMIUM",
    scope: SubscriptionScope.MASTER,
    features: {
      analytics_booking_insights: true,
      analytics_cohorts: true,
      analytics_forecast: true,
    },
    sortOrder: 20,
    inheritsFrom: "MASTER_PRO",
  },
  {
    code: "STUDIO_FREE",
    name: "STUDIO FREE",
    monthlyPriceKopeks: 0,
    tier: "FREE",
    scope: SubscriptionScope.STUDIO,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      analytics_dashboard: true,
    },
    sortOrder: 0,
    inheritsFrom: null,
  },
  {
    code: "STUDIO_PRO",
    name: "STUDIO PRO",
    monthlyPriceKopeks: 200000,
    tier: "PRO",
    scope: SubscriptionScope.STUDIO,
    features: {
      analytics_revenue: true,
      analytics_clients: true,
    },
    sortOrder: 10,
    inheritsFrom: "STUDIO_FREE",
  },
  {
    code: "STUDIO_PREMIUM",
    name: "STUDIO PREMIUM",
    monthlyPriceKopeks: 500000,
    tier: "PREMIUM",
    scope: SubscriptionScope.STUDIO,
    features: {
      analytics_booking_insights: true,
      analytics_cohorts: true,
      analytics_forecast: true,
    },
    sortOrder: 20,
    inheritsFrom: "STUDIO_PRO",
  },
];

export async function ensureDefaultPlans() {
  const existing = await prisma.billingPlan.findMany({
    select: {
      id: true,
      code: true,
      inheritsFromPlanId: true,
      sortOrder: true,
      tier: true,
      scope: true,
      name: true,
      features: true,
    },
  });
  const byCode = new Map(existing.map((plan) => [plan.code, plan]));

  const missing = DEFAULT_PLANS.filter((plan) => !byCode.has(plan.code));
  if (missing.length > 0) {
    for (const plan of missing) {
      const inheritsFromPlanId = plan.inheritsFrom ? byCode.get(plan.inheritsFrom)?.id ?? null : null;
      const created = await prisma.billingPlan.create({
        data: {
          code: plan.code,
          name: plan.name,
          tier: plan.tier,
          scope: plan.scope,
          features: plan.features as Prisma.InputJsonValue,
          sortOrder: plan.sortOrder ?? 0,
          inheritsFromPlanId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          inheritsFromPlanId: true,
          sortOrder: true,
          tier: true,
          scope: true,
          name: true,
          features: true,
        },
      });
      byCode.set(created.code, created);
    }
  }

  const updates = DEFAULT_PLANS.flatMap((plan) => {
    const existingPlan = byCode.get(plan.code);
    if (!existingPlan) return [];
    const desiredInheritsFromId = plan.inheritsFrom ? byCode.get(plan.inheritsFrom)?.id ?? null : null;
    const desiredSortOrder = plan.sortOrder ?? 0;
    const needsTier = existingPlan.tier !== plan.tier;
    const needsScope = existingPlan.scope !== plan.scope;
    const needsSort = existingPlan.sortOrder !== desiredSortOrder;
    const needsParent = (existingPlan.inheritsFromPlanId ?? null) !== (desiredInheritsFromId ?? null);

    if (!needsSort && !needsParent && !needsTier && !needsScope) {
      return [];
    }

    return [
      prisma.billingPlan.update({
        where: { id: existingPlan.id },
        data: {
          sortOrder: desiredSortOrder,
          inheritsFromPlanId: desiredInheritsFromId,
          ...(needsTier ? { tier: plan.tier } : {}),
          ...(needsScope ? { scope: plan.scope } : {}),
        },
      }),
    ];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  const planIds = Array.from(byCode.values()).map((plan) => plan.id);
  if (planIds.length === 0) return;

  const existingPrices = await prisma.billingPlanPrice.findMany({
    where: { planId: { in: planIds } },
    select: { planId: true, periodMonths: true },
  });
  const existingByPlan = new Map<string, Set<number>>();
  for (const price of existingPrices) {
    const set = existingByPlan.get(price.planId) ?? new Set<number>();
    set.add(price.periodMonths);
    existingByPlan.set(price.planId, set);
  }

  const toCreate: Prisma.BillingPlanPriceCreateManyInput[] = [];
  for (const plan of DEFAULT_PLANS) {
    const planRow = byCode.get(plan.code);
    if (!planRow) continue;
    const existingSet = existingByPlan.get(planRow.id) ?? new Set<number>();
    for (const periodMonths of BILLING_PERIODS) {
      if (existingSet.has(periodMonths)) continue;
      toCreate.push({
        planId: planRow.id,
        periodMonths,
        priceKopeks: plan.monthlyPriceKopeks * periodMonths,
        isActive: true,
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.billingPlanPrice.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }
}
