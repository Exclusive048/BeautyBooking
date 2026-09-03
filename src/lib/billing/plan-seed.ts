import { Prisma, SubscriptionScope } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { STUDIO_TEAM_CAP_BY_TIER } from "@/lib/billing/constants";

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
    name: "FREE",
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
    name: "FREE",
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

      // Limits — team cap from the canonical BC-CAP tier map (FREE = 2)
      maxTeamMasters: STUDIO_TEAM_CAP_BY_TIER.FREE,
      maxPortfolioPhotosStudioDesign: 15,
      maxPortfolioPhotosPerStudioMaster: 10,
    },
  },
];

/**
 * PWA-FIX-01 — клиент приходит АРГУМЕНТОМ, а не берётся из `@/lib/prisma`.
 *
 * 🔴 Прежняя форма делала сидер незапускаемым, причём молча по симптому:
 * `src/lib/prisma.ts` первой строкой импортирует `server-only`, а тот вне
 * рантайма Next (условие экспорта `react-server` не выставлено) бросает
 * «This module cannot be imported from a Client Component module». То есть
 * `npm run seed:plans` падал ЕЩЁ ДО первой строки `main()` — на импорте, — и
 * сообщение говорило про клиентские компоненты, к которым сид отношения не
 * имеет. Цена в проде прямая: без строк `MASTER_FREE`/`STUDIO_FREE` не
 * выдаётся бесплатная подписка (`ensureFreeSubscription`) и пуста страница
 * «Тарифы» (`/api/billing/plans` на masterryadom.ru отдавал пустые списки
 * 2026-09-01).
 *
 * Параметр — не «гибкость на будущее», а способ НЕ тащить рантайм-клиент в
 * процесс, которому он не нужен: у сида свой `new PrismaClient()`. Рантайм
 * этих функций не зовёт вовсе — единственные потребители суть скрипты.
 */
export async function ensureFreePlans(
  client: Pick<PrismaClient, "billingPlan">,
): Promise<void> {
  for (const plan of FREE_PLANS) {
    await client.billingPlan.upsert({
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
