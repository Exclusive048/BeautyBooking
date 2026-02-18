import { ProviderType } from "@prisma/client";
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
};

export type CurrentPlanInfo = {
  planId: string | null;
  planCode: string | null;
  tier: PlanTier | null;
  providerType: ProviderType | null;
  features: PlanFeatures;
  system: SystemFlags;
};

function parseSystemFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

async function getSystemFlags(): Promise<SystemFlags> {
  const onlinePayments = await prisma.systemConfig.findUnique({
    where: { key: "onlinePaymentsEnabled" },
    select: { value: true },
  });
  return {
    onlinePaymentsEnabled: parseSystemFlag(onlinePayments?.value, false),
  };
}

export async function getCurrentPlan(userId: string): Promise<CurrentPlanInfo> {
  const user = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { roles: true },
  });
  const providerType = user?.roles.includes("STUDIO") || user?.roles.includes("STUDIO_ADMIN")
    ? ProviderType.STUDIO
    : ProviderType.MASTER;

  const subscription = await prisma.userSubscription.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      plan: {
        select: { id: true, code: true, tier: true, providerType: true, features: true },
      },
    },
  });

  let planId: string | null = subscription?.plan?.id ?? null;
  let planCode: string | null = subscription?.plan?.code ?? null;
  let tier: PlanTier | null = subscription?.plan?.tier ?? null;
  let planProviderType: ProviderType | null = subscription?.plan?.providerType ?? null;
  let features: PlanFeatures = getDefaultPlanFeatures();

  if (planId) {
    const chain = await loadPlanChain(planId);
    features = resolveEffectiveFeatures(planId, new Map(chain.map((item) => [item.id, item])));
  } else {
    const fallbackCode = providerType === ProviderType.STUDIO ? "STUDIO_FREE" : "MASTER_FREE";
    const freePlan = await prisma.billingPlan.findUnique({
      where: { code: fallbackCode },
      select: { id: true, code: true, tier: true, providerType: true, features: true, inheritsFromPlanId: true },
    });
    if (freePlan) {
      planId = freePlan.id;
      planCode = freePlan.code;
      tier = freePlan.tier;
      planProviderType = freePlan.providerType;
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
    providerType: planProviderType ?? providerType,
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
