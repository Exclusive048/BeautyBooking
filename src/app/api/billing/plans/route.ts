import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveFeatures, type PlanNode } from "@/lib/billing/features";
import type { SubscriptionScope } from "@prisma/client";

export const runtime = "nodejs";

type PlanRecord = {
  id: string;
  code: string;
  name: string;
  tier: string;
  scope: SubscriptionScope;
  sortOrder: number;
  inheritsFromPlanId: string | null;
  features: unknown;
  prices: Array<{ periodMonths: number; priceKopeks: number }>;
};

function buildPlanMap(plans: PlanRecord[]): Map<string, PlanNode> {
  return new Map(plans.map((plan) => [plan.id, { id: plan.id, inheritsFromPlanId: plan.inheritsFromPlanId, features: plan.features }]));
}

export async function GET() {
  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      sortOrder: true,
      inheritsFromPlanId: true,
      features: true,
      prices: {
        where: { isActive: true },
        select: { periodMonths: true, priceKopeks: true },
        orderBy: { periodMonths: "asc" },
      },
    },
  });

  const planMap = buildPlanMap(plans);
  const mapped = plans.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    tier: plan.tier,
    scope: plan.scope,
    sortOrder: plan.sortOrder,
    prices: plan.prices,
    features: resolveEffectiveFeatures(plan.id, planMap),
  }));

  const grouped: Record<SubscriptionScope, typeof mapped> = { MASTER: [], STUDIO: [] };
  for (const plan of mapped) {
    grouped[plan.scope].push(plan);
  }

  return ok({ plans: grouped });
}
