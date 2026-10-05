import type { PlanTier } from "@/lib/billing/features";
import type { AnalyticsFeatureKey } from "@/features/analytics/domain/guards";
import type { StudioAnalyticsFeatureFlags } from "./types";

/**
 * MOBILE-STUDIO-C (G8) — замки разделов аналитики студии для приложения.
 *
 * Веб накрывает раздел, недоступный на тарифе, оверлеем `<FeatureGate>`, а
 * сам раздел приходит `null`. Приложению нужна причина в обычной форме
 * ошибки — та же, что отдаёт `ensureFeatureAccess` у `/api/analytics/*`
 * (403 `FEATURE_GATE`, «Этот отчёт недоступен на вашем тарифе.»,
 * `details.requiredPlan`), — чтобы показать замок и кнопку «Подписка» без
 * отдельного запроса. `null` — раздел открыт.
 */

export const ANALYTICS_LOCK_MESSAGE = "Этот отчёт недоступен на вашем тарифе.";

export type StudioAnalyticsLock = {
  code: "FEATURE_GATE";
  message: string;
  details: { feature: AnalyticsFeatureKey; requiredPlan: PlanTier };
} | null;

export type StudioAnalyticsLocks = {
  /** Выручка: график обзора, вкладки «Мастера» и «Услуги». */
  revenue: StudioAnalyticsLock;
  /** Сегменты и топ клиентов (вкладка «Клиенты»). */
  clients: StudioAnalyticsLock;
  /** Тепловая карта записей в обзоре. */
  bookingInsights: StudioAnalyticsLock;
};

function lock(
  open: boolean,
  feature: AnalyticsFeatureKey,
  requiredPlan: Record<AnalyticsFeatureKey, PlanTier>,
): StudioAnalyticsLock {
  if (open) return null;
  return {
    code: "FEATURE_GATE",
    message: ANALYTICS_LOCK_MESSAGE,
    details: { feature, requiredPlan: requiredPlan[feature] },
  };
}

export function buildStudioAnalyticsLocks(
  features: StudioAnalyticsFeatureFlags,
  requiredPlan: Record<AnalyticsFeatureKey, PlanTier>,
): StudioAnalyticsLocks {
  return {
    revenue: lock(features.revenue, "analytics_revenue", requiredPlan),
    clients: lock(features.clients, "analytics_clients", requiredPlan),
    bookingInsights: lock(features.bookingInsights, "analytics_booking_insights", requiredPlan),
  };
}
