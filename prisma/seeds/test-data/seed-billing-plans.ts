import { Prisma, PlanTier, SubscriptionScope, type BillingPlan } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";

// Minimal feature shapes — production admin UI maintains the canonical
// values. We mirror the FREE feature surface from src/lib/billing/plan-seed.ts
// then layer paid features on top for PRO / PREMIUM. Re-running the seed
// preserves admin-tuned values because we use the upsert `update: {}` idiom
// when the plan already exists.

type PlanSeed = {
  code: string;
  name: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  features: Prisma.InputJsonValue;
};

const PLANS: ReadonlyArray<PlanSeed> = [
  {
    code: "MASTER_FREE",
    name: "Free",
    tier: PlanTier.FREE,
    scope: SubscriptionScope.MASTER,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      analytics_dashboard: true,
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
      maxPortfolioPhotosSolo: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
  },
  {
    code: "MASTER_PRO",
    name: "Pro",
    tier: PlanTier.PRO,
    scope: SubscriptionScope.MASTER,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      onlinePayments: true,
      hotSlots: true,
      tgNotifications: true,
      vkNotifications: true,
      financeReport: true,
      clientVisitHistory: true,
      clientNotes: true,
      highlightCard: false,
      analytics_dashboard: true,
      analytics_revenue: true,
      analytics_clients: true,
      analytics_booking_insights: true,
      analytics_cohorts: false,
      analytics_forecast: false,
      maxPortfolioPhotosSolo: 60,
      maxPortfolioPhotosPerStudioMaster: 40,
    },
  },
  {
    code: "MASTER_PREMIUM",
    name: "Premium",
    tier: PlanTier.PREMIUM,
    scope: SubscriptionScope.MASTER,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      onlinePayments: true,
      hotSlots: true,
      tgNotifications: true,
      vkNotifications: true,
      financeReport: true,
      clientVisitHistory: true,
      clientNotes: true,
      highlightCard: true,
      analytics_dashboard: true,
      analytics_revenue: true,
      analytics_clients: true,
      analytics_booking_insights: true,
      analytics_cohorts: true,
      analytics_forecast: true,
      maxPortfolioPhotosSolo: 200,
      maxPortfolioPhotosPerStudioMaster: 100,
    },
  },
  {
    code: "STUDIO_FREE",
    name: "Free",
    tier: PlanTier.FREE,
    scope: SubscriptionScope.STUDIO,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      analytics_dashboard: true,
      onlinePayments: false,
      hotSlots: false,
      tgNotifications: false,
      vkNotifications: false,
      financeReport: false,
      clientVisitHistory: false,
      clientNotes: false,
      highlightCard: false,
      maxTeamMasters: 2,
      maxPortfolioPhotosStudioDesign: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
  },
  {
    code: "STUDIO_PRO",
    name: "Pro",
    tier: PlanTier.PRO,
    scope: SubscriptionScope.STUDIO,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      onlinePayments: true,
      hotSlots: true,
      tgNotifications: true,
      vkNotifications: true,
      financeReport: true,
      clientVisitHistory: true,
      clientNotes: true,
      highlightCard: false,
      analytics_dashboard: true,
      analytics_revenue: true,
      analytics_clients: true,
      maxTeamMasters: 8,
      maxPortfolioPhotosStudioDesign: 60,
      maxPortfolioPhotosPerStudioMaster: 40,
    },
  },
  {
    code: "STUDIO_PREMIUM",
    name: "Premium",
    tier: PlanTier.PREMIUM,
    scope: SubscriptionScope.STUDIO,
    features: {
      onlineBooking: true,
      catalogListing: true,
      pwaPush: true,
      profilePublicPage: true,
      notifications: true,
      onlinePayments: true,
      hotSlots: true,
      tgNotifications: true,
      vkNotifications: true,
      financeReport: true,
      clientVisitHistory: true,
      clientNotes: true,
      highlightCard: true,
      analytics_dashboard: true,
      analytics_revenue: true,
      analytics_clients: true,
      analytics_booking_insights: true,
      analytics_cohorts: true,
      analytics_forecast: true,
      maxTeamMasters: 30,
      maxPortfolioPhotosStudioDesign: 200,
      maxPortfolioPhotosPerStudioMaster: 100,
    },
  },
];

/**
 * Upsert plans by `code`. Empty `update` so an admin who already tuned
 * features in /admin/billing keeps their config. Only `create` ships our
 * defaults.
 */
export async function seedBillingPlans(): Promise<BillingPlan[]> {
  logSeed.section("Billing plans");
  const out: BillingPlan[] = [];
  for (const p of PLANS) {
    const row = await prisma.billingPlan.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code,
        name: p.name,
        tier: p.tier,
        scope: p.scope,
        features: p.features,
        isActive: true,
        sortOrder: p.tier === PlanTier.FREE ? 0 : p.tier === PlanTier.PRO ? 1 : 2,
      },
    });
    out.push(row);
  }
  logSeed.ok(`${out.length} billing plans ensured`);
  return out;
}
