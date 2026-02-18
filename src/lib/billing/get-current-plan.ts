import { prisma } from "@/lib/prisma";
import {
  getDefaultPlanFeatures,
  parsePlanFeatures,
  resolveEffectiveFeatures,
  type PlanFeatures,
  type PlanTier,
} from "@/lib/billing/features";

type SystemFlags = {
  onlinePaymentsEnabled: boolean;
};

export type CurrentPlanInfo = {
  planId: string | null;
  planCode: PlanTier | string;
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
  const subscription = await prisma.userSubscription.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      plan: {
        select: { id: true, code: true, features: true },
      },
    },
  });

  let planId: string | null = subscription?.plan?.id ?? null;
  let planCode: PlanTier | string = subscription?.plan?.code ?? "FREE";
  let features: PlanFeatures = getDefaultPlanFeatures();

  if (planId) {
    features = await resolveEffectiveFeatures(planId);
  } else {
    const freePlan = await prisma.billingPlan.findUnique({
      where: { code: "FREE" },
      select: { id: true, code: true, features: true },
    });
    if (freePlan) {
      planId = freePlan.id;
      planCode = freePlan.code;
      features = await resolveEffectiveFeatures(freePlan.id);
    } else {
      features = parsePlanFeatures(null);
      planCode = "FREE";
    }
  }

  const system = await getSystemFlags();

  return {
    planId,
    planCode,
    features,
    system,
  };
}
