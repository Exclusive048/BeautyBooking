import { getPlanFeaturesForUser } from "@/features/analytics";
import type { StudioAnalyticsFeatureFlags } from "../lib/types";

/**
 * Plan-flag projection for the studio analytics surface — mirrors
 * `getMasterAnalyticsFeatures` shape so the gating UX is consistent
 * across both cabinets. Reuses the existing `analytics_*` feature
 * catalog with `scope: "STUDIO"` resolution.
 *
 * Tier waterfall (per `src/lib/billing/feature-catalog.ts`):
 *   FREE     → dashboard only
 *   PRO      → + revenue + clients
 *   PREMIUM  → + bookingInsights + cohorts (+ forecast, not surfaced here)
 */
export async function getStudioAnalyticsFeatures(userId: string): Promise<StudioAnalyticsFeatureFlags> {
  const plan = await getPlanFeaturesForUser({ userId, scope: "STUDIO" });
  return {
    dashboard: Boolean(plan.features.analytics_dashboard),
    revenue: Boolean(plan.features.analytics_revenue),
    clients: Boolean(plan.features.analytics_clients),
    bookingInsights: Boolean(plan.features.analytics_booking_insights),
    cohorts: Boolean(plan.features.analytics_cohorts),
  };
}
