import { Prisma, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Only FREE plans are seeded. PRO and PREMIUM are created and configured
// by admins through /admin/billing. This prevents overwriting admin-managed
// pricing and feature configurations on every deployment.

const FREE_PLANS: Array<{
  code: string;
  name: string;
  scope: SubscriptionScope;
  features: Prisma.InputJsonValue;
}> = [
  {
    code: "MASTER_FREE",
    name: "Free",
    scope: SubscriptionScope.MASTER,
    features: {
      // Base features (always available)
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      analytics_dashboard: true,

      // Paid features disabled on free plan
      onlinePayments: false,
      hotSlots: false,
      tgNotifications: false,
      vkNotifications: false,
      financeReport: false,
      clientVisitHistory: false,
      clientNotes: false,
      highlightCard: false,
      analytics_revenue: false,
      analytics_clients: false,
      analytics_booking_insights: false,
      analytics_cohorts: false,
      analytics_forecast: false,

      // Limits
      maxPortfolioPhotosSolo: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
  },
  {
    code: "STUDIO_FREE",
    name: "Free",
    scope: SubscriptionScope.STUDIO,
    features: {
      // Base features
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      analytics_dashboard: true,

      // Paid features disabled on free plan
      onlinePayments: false,
      hotSlots: false,
      tgNotifications: false,
      vkNotifications: false,
      financeReport: false,
      clientVisitHistory: false,
      clientNotes: false,
      highlightCard: false,
      analytics_revenue: false,
      analytics_clients: false,
      analytics_booking_insights: false,
      analytics_cohorts: false,
      analytics_forecast: false,

      // Limits
      maxTeamMasters: 2,
      maxPortfolioPhotosStudioDesign: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
  },
];

export async function ensureFreePlans(): Promise<void> {
  for (const plan of FREE_PLANS) {
    await prisma.billingPlan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        name: plan.name,
        tier: "FREE",
        scope: plan.scope,
        features: plan.features,
        sortOrder: 0,
        isActive: true,
      },
      // Do NOT overwrite existing records — admins may have modified them.
      update: {},
    });
  }
}

// Keep backward-compatible export for existing migration scripts.
export const ensureDefaultPlans = ensureFreePlans;
