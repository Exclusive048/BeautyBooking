import { describe, it, expect } from "vitest";
import {
  calcSavingsPercent,
  findPrice,
  listIncludedFeatures,
  resolveMarketingPrices,
  type MarketingPlan,
} from "@/lib/billing/marketing-pricing";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";

// Build a fake MarketingPlan for pure helpers — no Prisma needed.
function buildPlan(overrides: Partial<MarketingPlan> = {}): MarketingPlan {
  const features: Record<FeatureKey, boolean | number | null> = {} as Record<
    FeatureKey,
    boolean | number | null
  >;
  for (const key of Object.keys(FEATURE_CATALOG) as FeatureKey[]) {
    const def = FEATURE_CATALOG[key];
    features[key] = def.kind === "boolean" ? false : null;
  }
  return {
    code: "MASTER_PRO",
    tier: "PRO",
    scope: "MASTER",
    features,
    prices: [
      { periodMonths: 1, priceKopeks: 100000 },
      { periodMonths: 3, priceKopeks: 270000 },
      { periodMonths: 6, priceKopeks: 510000 },
      { periodMonths: 12, priceKopeks: 960000 },
    ],
    isFreePlan: false,
    ...overrides,
  };
}

describe("billing/marketing-pricing — calcSavingsPercent", () => {
  it("returns null when monthly is missing", () => {
    expect(calcSavingsPercent(undefined, 96_000, 12)).toBeNull();
    expect(calcSavingsPercent(0, 96_000, 12)).toBeNull();
  });

  it("returns null for periodMonths=1 (no comparison possible)", () => {
    expect(calcSavingsPercent(10_000, 10_000, 1)).toBeNull();
  });

  it("returns null when periodKopeks ≥ fullPrice (no saving)", () => {
    // 10_000 monthly × 3 = 30_000; period costs 30_000 → no saving
    expect(calcSavingsPercent(10_000, 30_000, 3)).toBeNull();
    // period more expensive than monthly × N
    expect(calcSavingsPercent(10_000, 35_000, 3)).toBeNull();
  });

  it("returns positive saving for cheaper annual price", () => {
    // 100_000 monthly × 12 = 1_200_000; annual 960_000 → 20% saving (project default)
    expect(calcSavingsPercent(100_000, 960_000, 12)).toBe(20);
  });

  it("returns saving for 3-month bundle", () => {
    // 100_000 × 3 = 300_000; bundle 270_000 → 10% saving
    expect(calcSavingsPercent(100_000, 270_000, 3)).toBe(10);
  });

  it("rounds to integer percent", () => {
    // 100_000 × 12 = 1_200_000; period 1_080_001 → 9.99...% → rounds to 10%
    expect(calcSavingsPercent(100_000, 1_080_001, 12)).toBe(10);
  });
});

describe("billing/marketing-pricing — findPrice", () => {
  it("returns null when plan is null", () => {
    expect(findPrice(null, 1)).toBeNull();
  });

  it("returns matching price for known period", () => {
    const plan = buildPlan();
    const price = findPrice(plan, 12);
    expect(price).not.toBeNull();
    expect(price?.priceKopeks).toBe(960000);
  });

  it("returns null for unknown period", () => {
    const plan = buildPlan();
    expect(findPrice(plan, 24)).toBeNull();
  });
});

describe("billing/marketing-pricing — listIncludedFeatures", () => {
  it("returns empty list when nothing enabled", () => {
    const plan = buildPlan(); // all features default false/null
    const features = listIncludedFeatures(plan);
    expect(features).toEqual([]);
  });

  it("excludes false boolean features", () => {
    const features = listIncludedFeatures(buildPlan());
    expect(features.find((f) => f.key === "hotSlots")).toBeUndefined();
  });

  it("includes enabled boolean features", () => {
    const plan = buildPlan();
    plan.features.onlineBooking = true;
    plan.features.hotSlots = true;
    const features = listIncludedFeatures(plan);
    expect(features.some((f) => f.key === "onlineBooking")).toBe(true);
    expect(features.some((f) => f.key === "hotSlots")).toBe(true);
  });

  it("excludes limits with 0 or null value", () => {
    const plan = buildPlan();
    plan.features.maxPortfolioPhotosSolo = 0;
    plan.features.maxTeamMasters = null;
    const features = listIncludedFeatures(plan);
    expect(features.some((f) => f.key === "maxPortfolioPhotosSolo")).toBe(false);
    expect(features.some((f) => f.key === "maxTeamMasters")).toBe(false);
  });

  it("includes positive numeric limits (BOTH-scope key visible in MASTER plan)", () => {
    // maxPortfolioPhotosPerStudioMaster is appliesTo: "BOTH" — visible on any plan
    const plan = buildPlan({ scope: "MASTER" });
    plan.features.maxPortfolioPhotosPerStudioMaster = 5;
    const features = listIncludedFeatures(plan);
    expect(features.some((f) => f.key === "maxPortfolioPhotosPerStudioMaster")).toBe(true);
  });

  it("includes positive numeric limits scoped to STUDIO plan", () => {
    // maxTeamMasters is appliesTo: "STUDIO" — surfaces only on STUDIO-scope plan
    const plan = buildPlan({ scope: "STUDIO" });
    plan.features.maxTeamMasters = 5;
    const features = listIncludedFeatures(plan);
    expect(features.some((f) => f.key === "maxTeamMasters")).toBe(true);
  });

  it("filters out features whose scope is the opposite role", () => {
    // pick a STUDIO-only feature (if any in catalog), set it true, and serve a MASTER plan
    const studioOnly = (Object.keys(FEATURE_CATALOG) as FeatureKey[]).find(
      (k) => FEATURE_CATALOG[k].appliesTo === "STUDIO",
    );
    if (!studioOnly) return; // skip silently if catalog has none

    const plan = buildPlan({ scope: "MASTER" });
    plan.features[studioOnly] = true;
    const features = listIncludedFeatures(plan);
    expect(features.some((f) => f.key === studioOnly)).toBe(false);
  });

  it("respects the limit parameter", () => {
    const plan = buildPlan();
    // enable several boolean features
    plan.features.onlineBooking = true;
    plan.features.catalogListing = true;
    plan.features.profilePublicPage = true;
    plan.features.pwaPush = true;
    const features = listIncludedFeatures(plan, 2);
    expect(features.length).toBe(2);
  });

  it("returns title alongside key", () => {
    const plan = buildPlan();
    plan.features.onlineBooking = true;
    const features = listIncludedFeatures(plan);
    const item = features.find((f) => f.key === "onlineBooking");
    expect(item?.title).toBe(FEATURE_CATALOG.onlineBooking.title);
  });

  it("orders by uiOrder ascending", () => {
    const plan = buildPlan();
    // Find any two with known orders
    const sorted = (Object.keys(FEATURE_CATALOG) as FeatureKey[])
      .filter((k) => {
        const def = FEATURE_CATALOG[k];
        return def.kind === "boolean" && (def.appliesTo === "BOTH" || def.appliesTo === plan.scope);
      })
      .sort((a, b) => FEATURE_CATALOG[a].uiOrder - FEATURE_CATALOG[b].uiOrder);

    if (sorted.length < 2) return;
    plan.features[sorted[0]] = true;
    plan.features[sorted[1]] = true;
    const features = listIncludedFeatures(plan);
    expect(features[0].key).toBe(sorted[0]);
    expect(features[1].key).toBe(sorted[1]);
  });
});

describe("billing/marketing-pricing — resolveMarketingPrices (FIX-R2-05-B)", () => {
  const MONTHLY = 100_000;

  it("ignores 0/non-positive period rows and shows the fallback instead of free", () => {
    // the footgun: 1mo set, 3/6/12 left at 0 → must NOT render "0 ₽ −100%"
    const resolved = resolveMarketingPrices([
      { periodMonths: 1, priceKopeks: MONTHLY },
      { periodMonths: 3, priceKopeks: 0 },
      { periodMonths: 6, priceKopeks: 0 },
      { periodMonths: 12, priceKopeks: 0 },
    ]);
    expect(resolved).toEqual([
      { periodMonths: 1, priceKopeks: MONTHLY },
      { periodMonths: 3, priceKopeks: MONTHLY * 3 },
      { periodMonths: 6, priceKopeks: MONTHLY * 6 },
      { periodMonths: 12, priceKopeks: Math.floor(MONTHLY * 12 * 0.8) },
    ]);
    expect(resolved.every((p) => p.priceKopeks > 0)).toBe(true);
  });

  it("a monthly-only plan offers all 4 periods via fallback", () => {
    const resolved = resolveMarketingPrices([{ periodMonths: 1, priceKopeks: MONTHLY }]);
    expect(resolved.map((p) => p.periodMonths)).toEqual([1, 3, 6, 12]);
  });

  it("a plan with no positive monthly resolves to an empty set ('Уточняется')", () => {
    expect(resolveMarketingPrices([])).toEqual([]);
    expect(resolveMarketingPrices([{ periodMonths: 1, priceKopeks: 0 }])).toEqual([]);
  });

  it("explicit positive rows win over the fallback", () => {
    const resolved = resolveMarketingPrices([
      { periodMonths: 1, priceKopeks: MONTHLY },
      { periodMonths: 12, priceKopeks: 1_000_000 }, // explicit, ≠ monthly*12*0.8
    ]);
    expect(resolved.find((p) => p.periodMonths === 12)?.priceKopeks).toBe(1_000_000);
  });
});
