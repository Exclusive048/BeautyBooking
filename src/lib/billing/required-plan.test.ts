import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { analyticsRequiredPlans, FEATURE_REQUIRED_PLAN } from "@/features/analytics/domain/guards";
import { createFeatureGateError } from "@/lib/billing/guards";
import { PLAN_CATALOG } from "@/lib/billing/plan-catalog";
import { cheapestPlanTierWithFeature } from "@/lib/billing/required-plan";
import { clientCardRequiredPlan, ensureClientCardAccess } from "@/lib/crm/guards";

/**
 * MOBILE-POLISH — подсказка «нужен тариф …» (`details.requiredPlan`) равна
 * самому дешёвому тарифу каталога с этой фичей. Повод: тепловая карта записей
 * входит в PRO, а отказ называл PREMIUM.
 */

describe("cheapestPlanTierWithFeature", () => {
  it("по каталогу: сводка — FREE, выручка и тепловая карта — PRO, прогноз — PREMIUM", () => {
    expect(cheapestPlanTierWithFeature("analytics_dashboard")).toBe("FREE");
    expect(cheapestPlanTierWithFeature("analytics_revenue")).toBe("PRO");
    expect(cheapestPlanTierWithFeature("analytics_booking_insights")).toBe("PRO");
    expect(cheapestPlanTierWithFeature("analytics_forecast")).toBe("PREMIUM");
    expect(cheapestPlanTierWithFeature("highlightCard")).toBe("PREMIUM");
    expect(cheapestPlanTierWithFeature("onlinePayments", "STUDIO")).toBe("PRO");
  });

  it("фича, которой у кабинета нет ни в одном тарифе, — без подсказки", () => {
    expect(cheapestPlanTierWithFeature("hotSlots", "MASTER")).toBe("PRO");
    expect(cheapestPlanTierWithFeature("hotSlots", "STUDIO")).toBeUndefined();
    expect(cheapestPlanTierWithFeature("noSuchFeature")).toBeUndefined();
  });

  it("совпадает с прямым перебором каталога для каждой булевой фичи", () => {
    const features = new Set(PLAN_CATALOG.flatMap((plan) => Object.keys(plan.features)));
    for (const scope of ["MASTER", "STUDIO"] as const) {
      for (const feature of features) {
        const granting = PLAN_CATALOG.filter((plan) => plan.scope === scope && plan.features[feature] === true).sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        const cheapest = granting[0];
        if (!cheapest) continue;
        expect(cheapestPlanTierWithFeature(feature, scope), `${scope}.${feature}`).toBe(cheapest.tier);
      }
    }
  });
});

describe("гейты берут подсказку из каталога", () => {
  it("createFeatureGateError: тариф по кабинету", () => {
    const error = createFeatureGateError("onlinePayments", "MASTER");
    expect(error).toBeInstanceOf(AppError);
    expect(error.details).toEqual({ feature: "onlinePayments", requiredPlan: "PRO" });
  });

  it("аналитика: замки и отказ `ensureFeatureAccess` — по каталогу, у обоих кабинетов одинаково", () => {
    expect(FEATURE_REQUIRED_PLAN).toEqual({
      analytics_dashboard: "FREE",
      analytics_revenue: "PRO",
      analytics_clients: "PRO",
      analytics_booking_insights: "PRO",
      analytics_cohorts: "PREMIUM",
      analytics_forecast: "PREMIUM",
    });
    expect(analyticsRequiredPlans("MASTER")).toEqual(FEATURE_REQUIRED_PLAN);
    expect(analyticsRequiredPlans("STUDIO")).toEqual(FEATURE_REQUIRED_PLAN);
  });

  it("карточка клиента: PRO в подсказке и в тексте", () => {
    expect(clientCardRequiredPlan()).toBe("PRO");
    let caught: unknown = null;
    try {
      ensureClientCardAccess({ clientVisitHistory: false, clientNotes: false } as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).message).toBe("Заметки, теги и история доступны с тарифа PRO.");
    expect((caught as AppError).details).toEqual({ feature: "clientVisitHistory", requiredPlan: "PRO" });
  });
});
