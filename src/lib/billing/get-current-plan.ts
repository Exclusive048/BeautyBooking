import { SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getDefaultPlanFeatures,
  resolveEffectiveFeatures,
  type PlanFeatures,
  type PlanNode,
  type PlanTier,
} from "@/lib/billing/features";

type SystemFlags = {
  onlinePaymentsEnabled: boolean;
  visualSearchEnabled: boolean;
};

export type CurrentPlanInfo = {
  planId: string | null;
  planCode: string | null;
  tier: PlanTier | null;
  scope: SubscriptionScope | null;
  features: PlanFeatures;
  system: SystemFlags;
};

function parseSystemFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

async function getSystemFlags(): Promise<SystemFlags> {
  const [onlinePayments, visualSearch] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { key: "onlinePaymentsEnabled" },
      select: { value: true },
    }),
    prisma.systemConfig.findUnique({
      where: { key: "visualSearchEnabled" },
      select: { value: true },
    }),
  ]);

  return {
    onlinePaymentsEnabled: parseSystemFlag(onlinePayments?.value, false),
    visualSearchEnabled: parseSystemFlag(visualSearch?.value, false),
  };
}

export async function getCurrentPlan(
  userId: string,
  scopeOverride?: SubscriptionScope
): Promise<CurrentPlanInfo> {
  const user = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { roles: true },
  });
  const fallbackScope =
    scopeOverride ??
    (user?.roles.includes("STUDIO") || user?.roles.includes("STUDIO_ADMIN")
      ? SubscriptionScope.STUDIO
      : SubscriptionScope.MASTER);

  const subscription = await prisma.userSubscription.findUnique({
    where: { userId_scope: { userId, scope: fallbackScope } },
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      plan: {
        select: { id: true, code: true, tier: true, scope: true, features: true },
      },
    },
  });

  const now = new Date();
  const isActive =
    subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);

  let planId: string | null = isActive ? subscription?.plan?.id ?? null : null;
  let planCode: string | null = isActive ? subscription?.plan?.code ?? null : null;
  let tier: PlanTier | null = isActive ? subscription?.plan?.tier ?? null : null;
  let planScope: SubscriptionScope | null = isActive ? subscription?.plan?.scope ?? null : null;
  let features: PlanFeatures = getDefaultPlanFeatures();

  if (planId) {
    const chain = await loadPlanChain(planId);
    features = resolveEffectiveFeatures(planId, new Map(chain.map((item) => [item.id, item])));
  } else {
    const fallbackCode = fallbackScope === SubscriptionScope.STUDIO ? "STUDIO_FREE" : "MASTER_FREE";
    const freePlan = await prisma.billingPlan.findUnique({
      where: { code: fallbackCode },
      select: { id: true, code: true, tier: true, scope: true, features: true, inheritsFromPlanId: true },
    });
    if (freePlan) {
      planId = freePlan.id;
      planCode = freePlan.code;
      tier = freePlan.tier;
      planScope = freePlan.scope;
      const chain = await loadPlanChain(freePlan.id);
      features = resolveEffectiveFeatures(freePlan.id, new Map(chain.map((item) => [item.id, item])));
    } else {
      planCode = fallbackCode;
      tier = "FREE";
    }
  }

  const system = await getSystemFlags();

  return {
    planId,
    planCode,
    tier,
    scope: planScope ?? fallbackScope,
    features,
    system,
  };
}

async function loadPlanChain(planId: string): Promise<PlanNode[]> {
  const chain: PlanNode[] = [];
  const visited = new Set<string>();
  let currentId: string | null = planId;
  const MAX_DEPTH = 8;

  for (let depth = 0; depth < MAX_DEPTH && currentId; depth += 1) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const plan: PlanNode | null = await prisma.billingPlan.findUnique({
      where: { id: currentId },
      select: { id: true, inheritsFromPlanId: true, features: true },
    });
    if (!plan) break;
    chain.push(plan);
    currentId = plan.inheritsFromPlanId ?? null;
  }

  return chain;
}
