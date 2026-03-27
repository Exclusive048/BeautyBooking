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
      profilePublicPage: true,
      notifications: true,
      analytics_dashboard: true,
      maxPortfolioPhotosSolo: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
    sortOrder: 0,
    inheritsFrom: null,
  },
  {
    code: "MASTER_PRO",
    name: "MASTER PRO",
    monthlyPriceKopeks: 99000,
    tier: "PRO",
    scope: SubscriptionScope.MASTER,
    features: {
      onlinePayments: true,
      hotSlots: true,
      tgNotifications: true,
      vkNotifications: true,
      clientVisitHistory: true,
      clientNotes: true,
      financeReport: true,
      analytics_revenue: true,
      analytics_clients: true,
      maxPortfolioPhotosSolo: 100,
      maxPortfolioPhotosPerStudioMaster: 50,
    },
    sortOrder: 10,
    inheritsFrom: "MASTER_FREE",
  },
  {
    code: "MASTER_PREMIUM",
    name: "MASTER PREMIUM",
    monthlyPriceKopeks: 199000,
    tier: "PREMIUM",
    scope: SubscriptionScope.MASTER,
    features: {
      highlightCard: true,
      analytics_booking_insights: true,
      analytics_cohorts: true,
      analytics_forecast: true,
      maxPortfolioPhotosSolo: 500,
      maxPortfolioPhotosPerStudioMaster: 200,
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
      profilePublicPage: true,
      notifications: true,
      analytics_dashboard: true,
      maxTeamMasters: 2,
      maxPortfolioPhotosStudioDesign: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
    sortOrder: 0,
    inheritsFrom: null,
  },
  {
    code: "STUDIO_PRO",
    name: "STUDIO PRO",
    monthlyPriceKopeks: 249000,
    tier: "PRO",
    scope: SubscriptionScope.STUDIO,
    features: {
      onlinePayments: true,
      hotSlots: true,
      tgNotifications: true,
      vkNotifications: true,
      clientVisitHistory: true,
      clientNotes: true,
      financeReport: true,
      analytics_revenue: true,
      analytics_clients: true,
      maxTeamMasters: 7,
      maxPortfolioPhotosStudioDesign: 100,
      maxPortfolioPhotosPerStudioMaster: 50,
    },
    sortOrder: 10,
    inheritsFrom: "STUDIO_FREE",
  },
  {
    code: "STUDIO_PREMIUM",
    name: "STUDIO PREMIUM",
    monthlyPriceKopeks: 499000,
    tier: "PREMIUM",
    scope: SubscriptionScope.STUDIO,
    features: {
      highlightCard: true,
      analytics_booking_insights: true,
      analytics_cohorts: true,
      analytics_forecast: true,
      maxTeamMasters: 50,
      maxPortfolioPhotosStudioDesign: 500,
      maxPortfolioPhotosPerStudioMaster: 200,
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

  for (const plan of DEFAULT_PLANS) {
    const inheritsFromPlanId = plan.inheritsFrom ? byCode.get(plan.inheritsFrom)?.id ?? null : null;
    const upserted = await prisma.billingPlan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        name: plan.name,
        tier: plan.tier,
        scope: plan.scope,
        features: plan.features as Prisma.InputJsonValue,
        sortOrder: plan.sortOrder ?? 0,
        inheritsFromPlanId,
        isActive: true,
      },
      update: {
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
    byCode.set(upserted.code, upserted);
  }

  for (const plan of DEFAULT_PLANS) {
    const planRow = byCode.get(plan.code);
    if (!planRow) continue;

    await Promise.all(
      BILLING_PERIODS.map(async (periodMonths) => {
        const priceKopeks = plan.monthlyPriceKopeks * periodMonths;
        await prisma.billingPlanPrice.upsert({
          where: {
            planId_periodMonths: {
              planId: planRow.id,
              periodMonths,
            },
          },
          create: {
            planId: planRow.id,
            periodMonths,
            priceKopeks,
            isActive: true,
          },
          update: {
            priceKopeks,
            isActive: true,
          },
        });
      })
    );
  }
}
