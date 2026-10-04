import { describe, expect, it } from "vitest";
import { ANALYTICS_LOCK_MESSAGE, buildStudioAnalyticsLocks } from "./locks";

/** MOBILE-STUDIO-C (G8) — замки разделов аналитики в форме ошибки `FEATURE_GATE`. */

const REQUIRED = {
  analytics_dashboard: "FREE",
  analytics_revenue: "PRO",
  analytics_clients: "PRO",
  analytics_booking_insights: "PRO",
  analytics_cohorts: "PREMIUM",
  analytics_forecast: "PREMIUM",
} as const;

const flags = (patch: Partial<Record<"revenue" | "clients" | "bookingInsights", boolean>> = {}) => ({
  dashboard: true,
  revenue: true,
  clients: true,
  bookingInsights: true,
  cohorts: true,
  ...patch,
});

describe("buildStudioAnalyticsLocks", () => {
  it("всё открыто — все замки null", () => {
    expect(buildStudioAnalyticsLocks(flags(), REQUIRED)).toEqual({ revenue: null, clients: null, bookingInsights: null });
  });

  it("FREE — замки выручки, клиентов и тепловой карты (все PRO по каталогу)", () => {
    const locks = buildStudioAnalyticsLocks(flags({ revenue: false, clients: false, bookingInsights: false }), REQUIRED);
    expect(locks.revenue).toEqual({
      code: "FEATURE_GATE",
      message: ANALYTICS_LOCK_MESSAGE,
      details: { feature: "analytics_revenue", requiredPlan: "PRO" },
    });
    expect(locks.clients?.details).toEqual({ feature: "analytics_clients", requiredPlan: "PRO" });
    expect(locks.bookingInsights?.details).toEqual({ feature: "analytics_booking_insights", requiredPlan: "PRO" });
  });

  it("текст — как у `ensureFeatureAccess`", () => {
    expect(ANALYTICS_LOCK_MESSAGE).toBe("Этот отчёт недоступен на вашем тарифе.");
  });
});
