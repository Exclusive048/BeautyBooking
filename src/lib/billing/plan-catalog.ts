import type { PlanTier, SubscriptionScope } from "@prisma/client";
import { STUDIO_TEAM_CAP_BY_TIER } from "@/lib/billing/constants";
import type { BillingPeriodMonths } from "@/lib/billing/constants";

/**
 * BILLING-CATALOG-01 — канонический набор тарифов (решение владельца 2026-09-22).
 *
 * Три тарифа на каждый кабинет (мастер / студия): FREE → PRO → PREMIUM.
 * Этот модуль — ЕДИНСТВЕННОЕ место, где тарифы рождаются: его применяет сид
 * деплоя (`scripts/seed-billing-plans.ts`, шаг деплоя после миграций) и
 * тестовый сид (`prisma/seeds/test-data/seed-billing-plans.ts`).
 *
 * ── Цены (рубли, решение владельца) ─────────────────────────────────────────
 * База — PRO мастера: 600 ₽ за месяц, дальше каждый следующий срок = удвоение
 * предыдущего со скидкой 10% с округлением до 10 ₽:
 *   1 мес 600 · 3 мес 1800×0.9 = 1620 · 6 мес 3240×0.9 ≈ 2920 · 12 мес 5840×0.9 ≈ 5260.
 * PREMIUM = PRO + 20%. Студия = мастер × 1.8. Итог каждой производной цены
 * округляется до 10 ₽ ровно так же, как владелец округлил базовую лестницу.
 * Лестница пиннится `plan-catalog.test.ts` — числа там сверены с формулировкой
 * владельца, а не с этим кодом.
 *
 * До 1 ноября цены НЕ списываются: все кабинеты сидят на PREMIUM по акции
 * (`launch-promo.ts`), а checkout платного тарифа до этой даты отказывает.
 *
 * ── Версия каталога ──────────────────────────────────────────────────────────
 * Сид деплоя ПЕРЕЗАПИСЫВАЕТ тарифы только тогда, когда `PLAN_CATALOG_VERSION`
 * больше применённой (метка в `SystemConfig`), а в остальные деплои лишь
 * досоздаёт отсутствующее. Так правка тарифа из /admin/billing переживает
 * обычный деплой, а осознанная правка каталога в коде доезжает до прода.
 * Меняете тарифы здесь — поднимите версию.
 */
export const PLAN_CATALOG_VERSION = 1;

/** Ключ метки применённой версии в `SystemConfig`. */
export const PLAN_CATALOG_VERSION_KEY = "billingPlanCatalogVersion";

/** Базовая лестница PRO мастера в рублях — дословно числа владельца. */
export const MASTER_PRO_PRICES_RUB: Readonly<Record<BillingPeriodMonths, number>> = {
  1: 600,
  3: 1620,
  6: 2920,
  12: 5260,
};

export const PREMIUM_PRICE_MULTIPLIER = 1.2;
export const STUDIO_PRICE_MULTIPLIER = 1.8;

function roundToTenRub(rub: number): number {
  return Math.round(rub / 10) * 10;
}

function deriveLadder(multiplier: number): Record<BillingPeriodMonths, number> {
  const out = {} as Record<BillingPeriodMonths, number>;
  for (const [period, rub] of Object.entries(MASTER_PRO_PRICES_RUB)) {
    out[Number(period) as BillingPeriodMonths] =
      multiplier === 1 ? rub : roundToTenRub(rub * multiplier);
  }
  return out;
}

export function planPricesRub(
  scope: SubscriptionScope,
  tier: PlanTier,
): Record<BillingPeriodMonths, number> | null {
  if (tier === "FREE") return null;
  const tierMultiplier = tier === "PREMIUM" ? PREMIUM_PRICE_MULTIPLIER : 1;
  const scopeMultiplier = scope === "STUDIO" ? STUDIO_PRICE_MULTIPLIER : 1;
  return deriveLadder(tierMultiplier * scopeMultiplier);
}

type FeatureMap = Record<string, boolean | number | null>;

// Базовое — есть у всех трёх тарифов.
const BASE: FeatureMap = {
  onlineBooking: true,
  catalogListing: true,
  pwaPush: true,
  profilePublicPage: true,
  notifications: true,
  analytics_dashboard: true,
};

// FREE: всё, чтобы принимать записи, — страница, каталог, онлайн-запись,
// уведомления и сводка аналитики. Без CRM, продвижения и углублённой аналитики.
const FREE_EXTRAS: FeatureMap = {
  onlinePayments: false,
  hotSlots: false,
  tgNotifications: false,
  clientVisitHistory: false,
  clientNotes: false,
  highlightCard: false,
  analytics_revenue: false,
  analytics_clients: false,
  analytics_booking_insights: false,
  analytics_cohorts: false,
  analytics_forecast: false,
};

// PRO: рабочий инструмент — клиентская база (история визитов + заметки),
// горящие окошки (мастер), онлайн-оплата, уведомления в мессенджеры и
// основная аналитика (выручка, клиенты, записи).
const PRO_EXTRAS: FeatureMap = {
  onlinePayments: true,
  hotSlots: true,
  tgNotifications: true,
  clientVisitHistory: true,
  clientNotes: true,
  highlightCard: false,
  analytics_revenue: true,
  analytics_clients: true,
  analytics_booking_insights: true,
  analytics_cohorts: false,
  analytics_forecast: false,
};

// PREMIUM: всё, что есть в продукте, на максимальных объёмах — плюс выделение
// карточки в каталоге, возвращаемость клиентов и прогноз выручки.
const PREMIUM_EXTRAS: FeatureMap = {
  onlinePayments: true,
  hotSlots: true,
  tgNotifications: true,
  clientVisitHistory: true,
  clientNotes: true,
  highlightCard: true,
  analytics_revenue: true,
  analytics_clients: true,
  analytics_booking_insights: true,
  analytics_cohorts: true,
  analytics_forecast: true,
};

const EXTRAS_BY_TIER: Record<PlanTier, FeatureMap> = {
  FREE: FREE_EXTRAS,
  PRO: PRO_EXTRAS,
  PREMIUM: PREMIUM_EXTRAS,
};

const PORTFOLIO_LIMITS: Record<PlanTier, { own: number; perStudioMaster: number }> = {
  FREE: { own: 15, perStudioMaster: 10 },
  PRO: { own: 60, perStudioMaster: 40 },
  PREMIUM: { own: 200, perStudioMaster: 100 },
};

function buildFeatures(scope: SubscriptionScope, tier: PlanTier): FeatureMap {
  const features: FeatureMap = { ...BASE, ...EXTRAS_BY_TIER[tier] };
  const limits = PORTFOLIO_LIMITS[tier];
  if (scope === "MASTER") {
    features.maxPortfolioPhotosSolo = limits.own;
    features.maxPortfolioPhotosPerStudioMaster = limits.perStudioMaster;
  } else {
    // Горящие окошки — только у мастера (FIX-28: у студии нет поверхности).
    delete features.hotSlots;
    features.maxTeamMasters = STUDIO_TEAM_CAP_BY_TIER[tier];
    features.maxPortfolioPhotosStudioDesign = limits.own;
    features.maxPortfolioPhotosPerStudioMaster = limits.perStudioMaster;
  }
  return features;
}

export type CatalogPlan = {
  code: string;
  name: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  sortOrder: number;
  features: FeatureMap;
  /** Цены по срокам в КОПЕЙКАХ; пусто у FREE. */
  pricesKopeks: ReadonlyArray<{ periodMonths: BillingPeriodMonths; priceKopeks: number }>;
};

const TIERS: ReadonlyArray<PlanTier> = ["FREE", "PRO", "PREMIUM"];
const SCOPES: ReadonlyArray<SubscriptionScope> = ["MASTER", "STUDIO"];
const SORT_ORDER: Record<PlanTier, number> = { FREE: 0, PRO: 1, PREMIUM: 2 };

export function catalogPlanCode(scope: SubscriptionScope, tier: PlanTier): string {
  return `${scope}_${tier}`;
}

export const PLAN_CATALOG: ReadonlyArray<CatalogPlan> = SCOPES.flatMap((scope) =>
  TIERS.map((tier): CatalogPlan => {
    const rub = planPricesRub(scope, tier);
    return {
      code: catalogPlanCode(scope, tier),
      name: tier,
      tier,
      scope,
      sortOrder: SORT_ORDER[tier],
      features: buildFeatures(scope, tier),
      pricesKopeks: rub
        ? Object.entries(rub).map(([period, value]) => ({
            periodMonths: Number(period) as BillingPeriodMonths,
            priceKopeks: value * 100,
          }))
        : [],
    };
  }),
);
