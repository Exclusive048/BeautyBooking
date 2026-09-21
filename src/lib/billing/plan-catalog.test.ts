import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, catalogPlanCode, planPricesRub } from "@/lib/billing/plan-catalog";
import { STUDIO_TEAM_CAP_BY_TIER } from "@/lib/billing/constants";
import { FEATURE_CATALOG } from "@/lib/billing/feature-catalog";
import { resolvePlanPrice } from "@/lib/billing/pricing";

/**
 * BILLING-CATALOG-01 — лестница цен сверена с формулировкой владельца
 * (2026-09-22), а не с кодом каталога:
 *   «цена 2го тарифа для мастеров 600 рублей за месяц и потом уменьшаем на 10%,
 *    3 месяца 1800 * 0,9 = 1620, для 6 месяцев 3240 * 0,9 = 2920, для 12 мес = 5260.
 *    Для студий все цены умножаются на 1.8.» + «Цена 3 тарифа + 20% от 2го».
 * Производные цены округляются до 10 ₽ — так же, как владелец округлил 2916 → 2920.
 */
describe("plan-catalog — цены", () => {
  it("PRO мастера — дословно числа владельца", () => {
    expect(planPricesRub("MASTER", "PRO")).toEqual({ 1: 600, 3: 1620, 6: 2920, 12: 5260 });
  });

  it("PREMIUM мастера = PRO + 20%, до 10 ₽", () => {
    expect(planPricesRub("MASTER", "PREMIUM")).toEqual({ 1: 720, 3: 1940, 6: 3500, 12: 6310 });
  });

  it("студия = мастер × 1.8 (PRO) и × 1.8 × 1.2 (PREMIUM)", () => {
    expect(planPricesRub("STUDIO", "PRO")).toEqual({ 1: 1080, 3: 2920, 6: 5260, 12: 9470 });
    expect(planPricesRub("STUDIO", "PREMIUM")).toEqual({ 1: 1300, 3: 3500, 6: 6310, 12: 11360 });
  });

  it("FREE — без цен", () => {
    expect(planPricesRub("MASTER", "FREE")).toBeNull();
    expect(planPricesRub("STUDIO", "FREE")).toBeNull();
  });

  it("каждый срок платного тарифа — явная положительная строка, резолвер отдаёт её же (копейки)", () => {
    for (const plan of PLAN_CATALOG.filter((p) => p.tier !== "FREE")) {
      expect(plan.pricesKopeks.map((p) => p.periodMonths).sort((a, b) => a - b)).toEqual([1, 3, 6, 12]);
      for (const row of plan.pricesKopeks) {
        expect(row.priceKopeks).toBeGreaterThan(0);
        expect(resolvePlanPrice(plan.pricesKopeks, row.periodMonths)).toBe(row.priceKopeks);
      }
    }
  });

  it("длинный срок выгоднее помесячной оплаты у каждого платного тарифа", () => {
    for (const plan of PLAN_CATALOG.filter((p) => p.tier !== "FREE")) {
      const monthly = plan.pricesKopeks.find((p) => p.periodMonths === 1)!.priceKopeks;
      for (const row of plan.pricesKopeks.filter((p) => p.periodMonths > 1)) {
        expect(row.priceKopeks).toBeLessThan(monthly * row.periodMonths);
      }
    }
  });
});

describe("plan-catalog — тарифы", () => {
  it("ровно три тарифа на кабинет, канонические коды", () => {
    expect(PLAN_CATALOG.map((p) => p.code).sort()).toEqual(
      ["MASTER_FREE", "MASTER_PREMIUM", "MASTER_PRO", "STUDIO_FREE", "STUDIO_PREMIUM", "STUDIO_PRO"].sort(),
    );
    expect(catalogPlanCode("STUDIO", "PRO")).toBe("STUDIO_PRO");
  });

  it("фичи только из FEATURE_CATALOG и ни одной planned", () => {
    for (const plan of PLAN_CATALOG) {
      for (const [key, value] of Object.entries(plan.features)) {
        const def = FEATURE_CATALOG[key as keyof typeof FEATURE_CATALOG];
        expect(def, `${plan.code}.${key}`).toBeDefined();
        if (value === true) expect(def.status, `${plan.code}.${key}`).toBe("active");
      }
    }
  });

  it("PREMIUM включает КАЖДУЮ активную булеву фичу своего кабинета", () => {
    for (const scope of ["MASTER", "STUDIO"] as const) {
      const premium = PLAN_CATALOG.find((p) => p.code === `${scope}_PREMIUM`)!;
      for (const [key, def] of Object.entries(FEATURE_CATALOG)) {
        if (def.kind !== "boolean" || def.status !== "active") continue;
        if (def.appliesTo !== "BOTH" && def.appliesTo !== scope) continue;
        expect(premium.features[key], `${premium.code}.${key}`).toBe(true);
      }
    }
  });

  it("каждый следующий тариф не беднее предыдущего", () => {
    for (const scope of ["MASTER", "STUDIO"] as const) {
      const [free, pro, premium] = (["FREE", "PRO", "PREMIUM"] as const).map(
        (tier) => PLAN_CATALOG.find((p) => p.code === `${scope}_${tier}`)!,
      );
      for (const [lower, higher] of [[free, pro], [pro, premium]] as const) {
        for (const [key, value] of Object.entries(lower.features)) {
          if (value === true) expect(higher.features[key], `${higher.code}.${key}`).toBe(true);
          if (typeof value === "number") expect(higher.features[key] as number).toBeGreaterThanOrEqual(value);
        }
      }
    }
  });

  it("лимит команды студии — из BC-CAP", () => {
    for (const tier of ["FREE", "PRO", "PREMIUM"] as const) {
      const plan = PLAN_CATALOG.find((p) => p.code === `STUDIO_${tier}`)!;
      expect(plan.features.maxTeamMasters).toBe(STUDIO_TEAM_CAP_BY_TIER[tier]);
    }
  });

  it("горящие окошки у студии не объявлены (FIX-28: поверхность только у мастера)", () => {
    for (const plan of PLAN_CATALOG.filter((p) => p.scope === "STUDIO")) {
      expect(plan.features).not.toHaveProperty("hotSlots");
    }
  });
});
