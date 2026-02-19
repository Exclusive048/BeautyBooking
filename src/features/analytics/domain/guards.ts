import {
  MembershipStatus,
  ProviderType,
  StudioRole,
  SubscriptionScope,
} from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import {
  getDefaultPlanFeatures,
  resolveEffectiveFeatures,
  type PlanFeatures,
  type PlanNode,
  type PlanTier,
} from "@/lib/billing/features";

export type AnalyticsScope = SubscriptionScope;

export type AnalyticsContext = {
  scope: AnalyticsScope;
  providerId: string;
  studioId: string | null;
  studioProviderId: string | null;
  masterFilterId: string | null;
  timeZone: string;
};

export type AnalyticsPlanInfo = {
  planCode: string | null;
  tier: PlanTier | null;
  features: PlanFeatures;
};

export type AnalyticsFeatureKey =
  | "analytics_dashboard"
  | "analytics_revenue"
  | "analytics_clients"
  | "analytics_booking_insights"
  | "analytics_cohorts"
  | "analytics_forecast";

const FEATURE_REQUIRED_PLAN: Record<AnalyticsFeatureKey, PlanTier> = {
  analytics_dashboard: "FREE",
  analytics_revenue: "PRO",
  analytics_clients: "PRO",
  analytics_booking_insights: "PREMIUM",
  analytics_cohorts: "PREMIUM",
  analytics_forecast: "PREMIUM",
};

const PLAN_SELECT = {
  id: true,
  code: true,
  tier: true,
  scope: true,
  features: true,
  inheritsFromPlan: {
    select: {
      id: true,
      code: true,
      tier: true,
      scope: true,
      features: true,
      inheritsFromPlan: {
        select: {
          id: true,
          code: true,
          tier: true,
          scope: true,
          features: true,
        },
      },
    },
  },
} as const;

type PlanTree = {
  id: string;
  code: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  features: unknown;
  inheritsFromPlan?: PlanTree | null;
};

function flattenPlanChain(plan: PlanTree | null | undefined): PlanNode[] {
  const chain: PlanNode[] = [];
  let current: PlanTree | null | undefined = plan;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push({
      id: current.id,
      inheritsFromPlanId: current.inheritsFromPlan?.id ?? null,
      features: current.features,
    });
    current = current.inheritsFromPlan ?? null;
  }
  return chain;
}

export async function getPlanFeaturesForUser(input: {
  userId: string;
  scope: AnalyticsScope;
}): Promise<AnalyticsPlanInfo> {
  const subscription = await prisma.userSubscription.findUnique({
    where: { userId_scope: { userId: input.userId, scope: input.scope } },
    select: {
      status: true,
      currentPeriodEnd: true,
      plan: { select: PLAN_SELECT },
    },
  });

  const now = new Date();
  const isActive =
    subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);

  let plan: PlanTree | null = (isActive ? subscription?.plan : null) as PlanTree | null;

  if (!plan) {
    const fallbackCode = input.scope === "STUDIO" ? "STUDIO_FREE" : "MASTER_FREE";
    const freePlan = await prisma.billingPlan.findUnique({
      where: { code: fallbackCode },
      select: PLAN_SELECT,
    });
    plan = (freePlan ?? null) as PlanTree | null;
  }

  if (!plan) {
    return {
      planCode: null,
      tier: "FREE",
      features: getDefaultPlanFeatures(),
    };
  }

  const chain = flattenPlanChain(plan);
  const features = resolveEffectiveFeatures(plan.id, new Map(chain.map((item) => [item.id, item])));

  return {
    planCode: plan.code ?? null,
    tier: plan.tier ?? null,
    features,
  };
}

export async function ensureFeatureAccess(input: {
  userId: string;
  scope: AnalyticsScope;
  feature: AnalyticsFeatureKey;
}): Promise<AnalyticsPlanInfo> {
  const plan = await getPlanFeaturesForUser({ userId: input.userId, scope: input.scope });
  if (!plan.features[input.feature]) {
    throw new AppError("Функция недоступна на текущем тарифе.", 403, "FEATURE_GATE", {
      feature: input.feature,
      requiredPlan: FEATURE_REQUIRED_PLAN[input.feature],
    });
  }
  return plan;
}

export async function resolveAnalyticsContext(input: {
  userId: string;
  scope: AnalyticsScope;
  masterId?: string | null;
}): Promise<AnalyticsContext> {
  if (input.scope === "MASTER") {
    const provider = await prisma.provider.findFirst({
      where: {
        ownerUserId: input.userId,
        type: ProviderType.MASTER,
      },
      select: { id: true, timezone: true },
      orderBy: { createdAt: "asc" },
    });

    if (!provider) {
      throw new AppError("Недостаточно прав для доступа к аналитике мастера.", 403, "FORBIDDEN_ROLE");
    }

    return {
      scope: "MASTER",
      providerId: provider.id,
      studioId: null,
      studioProviderId: null,
      masterFilterId: null,
      timeZone: provider.timezone,
    };
  }

  const studios = await prisma.studio.findMany({
    where: {
      OR: [
        { ownerUserId: input.userId },
        { provider: { ownerUserId: input.userId } },
        {
          memberships: {
            some: {
              userId: input.userId,
              status: MembershipStatus.ACTIVE,
              roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN] },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      providerId: true,
      ownerUserId: true,
      provider: { select: { id: true, timezone: true, ownerUserId: true } },
      memberships: {
        where: {
          userId: input.userId,
          status: MembershipStatus.ACTIVE,
        },
        select: { roles: true },
      },
    },
  });

  if (studios.length === 0) {
    throw new AppError("Недостаточно прав для доступа к аналитике студии.", 403, "FORBIDDEN_ROLE");
  }

  const scored = studios.map((studio) => {
    const isOwner =
      studio.ownerUserId === input.userId || studio.provider.ownerUserId === input.userId;
    const roles = isOwner
      ? [StudioRole.OWNER]
      : studio.memberships[0]?.roles ?? [];
    const score = roles.includes(StudioRole.OWNER) ? 300 : roles.includes(StudioRole.ADMIN) ? 200 : 0;
    return { studio, score };
  });
  scored.sort((a, b) => b.score - a.score || a.studio.id.localeCompare(b.studio.id));
  const selected = scored[0].studio;

  let masterFilterId: string | null = null;
  if (input.masterId) {
    const master = await prisma.provider.findFirst({
      where: {
        id: input.masterId,
        type: ProviderType.MASTER,
        studioId: selected.providerId,
      },
      select: { id: true },
    });
    if (!master) {
      throw new AppError("Мастер не принадлежит студии.", 403, "FORBIDDEN");
    }
    masterFilterId = master.id;
  }

  return {
    scope: "STUDIO",
    providerId: selected.providerId,
    studioId: selected.id,
    studioProviderId: selected.providerId,
    masterFilterId,
    timeZone: selected.provider.timezone,
  };
}
