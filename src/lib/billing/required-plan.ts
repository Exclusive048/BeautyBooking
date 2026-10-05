import type { SubscriptionScope } from "@prisma/client";
import type { PlanTier } from "@/lib/billing/features";
import { PLAN_CATALOG } from "@/lib/billing/plan-catalog";

/**
 * MOBILE-POLISH — «нужен тариф …» в отказе `FEATURE_GATE` (`details.requiredPlan`).
 *
 * Подсказка жила константами у каждого гейта и разошлась с каталогом: тепловая
 * карта записей (`analytics_booking_insights`) входит в PRO, а отказ называл
 * PREMIUM — приложение звало купить тариф дороже нужного. Теперь подсказка
 * выводится из канонического каталога (`PLAN_CATALOG`, BILLING-CATALOG-01):
 * самый дешёвый тариф, где фича включена.
 *
 * Каталог — код, а не живые строки `BillingPlan`: правка тарифа из админки
 * подсказку не сдвинет (веб-замок `<FeatureGate>` читает живые тарифы сам).
 * Для фич, у которых каталог не знает ответа (нет ни в одном тарифе), —
 * `undefined`: лучше без подсказки, чем с неверной.
 */

const TIER_ORDER: readonly PlanTier[] = ["FREE", "PRO", "PREMIUM"];

function grants(value: unknown): boolean {
  return value === true || (typeof value === "number" && value > 0);
}

/**
 * Самый дешёвый тариф каталога с фичей `feature`. `scope` — кабинет (мастер /
 * студия); без него — самый дешёвый среди обоих.
 */
export function cheapestPlanTierWithFeature(feature: string, scope?: SubscriptionScope): PlanTier | undefined {
  for (const tier of TIER_ORDER) {
    const granted = PLAN_CATALOG.some(
      (plan) => plan.tier === tier && (scope === undefined || plan.scope === scope) && grants(plan.features[feature]),
    );
    if (granted) return tier;
  }
  return undefined;
}
