import { getPlanFeaturesForUser } from "@/features/analytics";

/**
 * Plan-flag projection for the master analytics surface (30a).
 *
 * Reuses the existing `analytics_*` feature catalog — no new entries.
 * The UI uses these flags to decide which sections to lock behind a
 * blurred preview + upgrade CTA. `customPeriod` is a placeholder for
 * the picker; in 30a it always shows the "Скоро" alert anyway, but the
 * flag exists so 30b can flip it without touching the chip rendering.
 */

export type MasterAnalyticsFeatureFlags = {
  /** KPI cards. FREE plans get this. */
  dashboard: boolean;
  /** Revenue line chart + top services. PRO+. */
  revenue: boolean;
  /** Heatmap + (future) funnel/lead-time. PRO+. */
  bookingInsights: boolean;
  /** Custom date range picker. Hidden behind premium gating in 30b. */
  customPeriod: boolean;
};

export async function getMasterAnalyticsFeatures(
  userId: string
): Promise<MasterAnalyticsFeatureFlags> {
  const plan = await getPlanFeaturesForUser({ userId, scope: "MASTER" });
  return {
    dashboard: Boolean(plan.features.analytics_dashboard),
    revenue: Boolean(plan.features.analytics_revenue),
    bookingInsights: Boolean(plan.features.analytics_booking_insights),
    // Cohorts/forecast are PREMIUM proxies for "all the deeper stuff".
    // Keep this as a future hook — UI shows a Lock icon on the chip
    // either way until the picker lands.
    customPeriod:
      Boolean(plan.features.analytics_cohorts) || Boolean(plan.features.analytics_forecast),
  };
}
