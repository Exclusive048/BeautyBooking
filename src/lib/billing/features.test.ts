import { describe, expect, it } from "vitest";
import {
  applyOverrides,
  canDisableFeature,
  deriveUiState,
  getDefaultPlanFeatures,
  isRelaxedLimit,
  parseOverrides,
  resolveEffectiveFeatures,
  type FeatureUiState,
  type PlanFeatureOverrides,
  type PlanNode,
} from "./features";

describe("isRelaxedLimit", () => {
  it("treats `undefined` parent as no constraint", () => {
    expect(isRelaxedLimit(undefined, 5)).toBe(true);
    expect(isRelaxedLimit(undefined, null)).toBe(true);
  });

  it("requires child to also be unlimited when parent is unlimited", () => {
    expect(isRelaxedLimit(null, null)).toBe(true);
    expect(isRelaxedLimit(null, 100)).toBe(false);
  });

  it("allows child to relax to unlimited", () => {
    expect(isRelaxedLimit(50, null)).toBe(true);
  });

  it("allows child to match parent exactly", () => {
    expect(isRelaxedLimit(50, 50)).toBe(true);
  });

  it("allows child to exceed parent (richer)", () => {
    expect(isRelaxedLimit(50, 100)).toBe(true);
  });

  it("rejects child stricter than parent", () => {
    expect(isRelaxedLimit(50, 40)).toBe(false);
    expect(isRelaxedLimit(50, 0)).toBe(false);
  });
});

describe("resolveEffectiveFeatures — inheritance chain walking", () => {
  function makePlanMap(plans: PlanNode[]): Map<string, PlanNode> {
    return new Map(plans.map((p) => [p.id, p]));
  }

  it("returns base defaults for a root plan with no overrides", () => {
    const plans: PlanNode[] = [
      { id: "free", inheritsFromPlanId: null, features: {} },
    ];
    const resolved = resolveEffectiveFeatures("free", makePlanMap(plans));
    expect(resolved.hotSlots).toBe(false);
    expect(resolved.onlineBooking).toBe(true);
  });

  it("applies overrides on top of base", () => {
    const plans: PlanNode[] = [
      { id: "free", inheritsFromPlanId: null, features: { hotSlots: true } },
    ];
    const resolved = resolveEffectiveFeatures("free", makePlanMap(plans));
    expect(resolved.hotSlots).toBe(true);
  });

  it("walks the chain root-to-leaf, child wins", () => {
    const plans: PlanNode[] = [
      { id: "free", inheritsFromPlanId: null, features: { hotSlots: true } },
      {
        id: "pro",
        inheritsFromPlanId: "free",
        features: { onlinePayments: true },
      },
      {
        id: "prem",
        inheritsFromPlanId: "pro",
        features: { analytics_dashboard: true },
      },
    ];
    const resolved = resolveEffectiveFeatures("prem", makePlanMap(plans));
    expect(resolved.hotSlots).toBe(true);            // from free
    expect(resolved.onlinePayments).toBe(true);      // from pro
    expect(resolved.analytics_dashboard).toBe(true); // from prem
  });

  it("child limit overrides parent limit", () => {
    const plans: PlanNode[] = [
      {
        id: "free",
        inheritsFromPlanId: null,
        features: { maxPortfolioPhotosSolo: 15 },
      },
      {
        id: "pro",
        inheritsFromPlanId: "free",
        features: { maxPortfolioPhotosSolo: 60 },
      },
    ];
    const resolved = resolveEffectiveFeatures("pro", makePlanMap(plans));
    expect(resolved.maxPortfolioPhotosSolo).toBe(60);
  });

  it("child can override limit to unlimited (null)", () => {
    const plans: PlanNode[] = [
      {
        id: "free",
        inheritsFromPlanId: null,
        features: { maxPortfolioPhotosSolo: 15 },
      },
      {
        id: "prem",
        inheritsFromPlanId: "free",
        features: { maxPortfolioPhotosSolo: null },
      },
    ];
    const resolved = resolveEffectiveFeatures("prem", makePlanMap(plans));
    expect(resolved.maxPortfolioPhotosSolo).toBeNull();
  });

  it("breaks out of a self-cycle without infinite loop", () => {
    // Cycle: A → A. resolveEffectiveFeatures is bounded by MAX_DEPTH;
    // even if such a row sneaks past the endpoint's `assertNoInheritanceCycle`
    // (e.g. created via direct SQL), runtime stays alive.
    const plans: PlanNode[] = [
      {
        id: "loop",
        inheritsFromPlanId: "loop",
        features: { hotSlots: true },
      },
    ];
    const resolved = resolveEffectiveFeatures("loop", makePlanMap(plans));
    expect(resolved.hotSlots).toBe(true);
  });

  it("breaks out of a two-node cycle", () => {
    // A → B → A
    const plans: PlanNode[] = [
      { id: "A", inheritsFromPlanId: "B", features: { hotSlots: true } },
      { id: "B", inheritsFromPlanId: "A", features: { onlinePayments: true } },
    ];
    // Should not hang; reads each plan once before bailing.
    const resolved = resolveEffectiveFeatures("A", makePlanMap(plans));
    expect(resolved.hotSlots).toBe(true);
    expect(resolved.onlinePayments).toBe(true);
  });
});

describe("parseOverrides — catalog filtering", () => {
  it("drops unknown keys", () => {
    const raw = { hotSlots: true, fakeFeature: true } as unknown;
    const overrides = parseOverrides(raw);
    expect(overrides.hotSlots).toBe(true);
    expect("fakeFeature" in overrides).toBe(false);
  });

  it("treats boolean=false as absent (so child doesn't tighten parent)", () => {
    const overrides = parseOverrides({ hotSlots: false });
    expect("hotSlots" in overrides).toBe(false);
  });

  it("preserves limit=null (explicit unlimited)", () => {
    const overrides = parseOverrides({ maxPortfolioPhotosSolo: null });
    expect(overrides.maxPortfolioPhotosSolo).toBeNull();
  });

  it("preserves numeric limits", () => {
    const overrides = parseOverrides({ maxPortfolioPhotosSolo: 100 });
    expect(overrides.maxPortfolioPhotosSolo).toBe(100);
  });

  it("rejects negative limits", () => {
    const overrides = parseOverrides({ maxPortfolioPhotosSolo: -5 });
    expect("maxPortfolioPhotosSolo" in overrides).toBe(false);
  });

  it("rejects non-finite limits (NaN, Infinity)", () => {
    const overrides = parseOverrides({ maxPortfolioPhotosSolo: NaN });
    expect("maxPortfolioPhotosSolo" in overrides).toBe(false);
  });

  it("returns empty for non-object input", () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides("string")).toEqual({});
    expect(parseOverrides(42)).toEqual({});
  });
});

describe("applyOverrides", () => {
  it("returns a fresh object (no mutation)", () => {
    const base = getDefaultPlanFeatures();
    const result = applyOverrides(base, { hotSlots: true });
    expect(result).not.toBe(base);
    expect(base.hotSlots).toBe(false); // unchanged
    expect(result.hotSlots).toBe(true);
  });

  it("only applies boolean overrides when set to true", () => {
    const base = getDefaultPlanFeatures();
    const overridesEmpty: PlanFeatureOverrides = {};
    const result = applyOverrides(base, overridesEmpty);
    expect(result.hotSlots).toBe(false);
  });

  it("applies numeric limit overrides", () => {
    const base = getDefaultPlanFeatures();
    const result = applyOverrides(base, { maxPortfolioPhotosSolo: 100 });
    expect(result.maxPortfolioPhotosSolo).toBe(100);
  });

  it("applies null override (unlimited)", () => {
    const base = getDefaultPlanFeatures();
    const result = applyOverrides(base, { maxPortfolioPhotosSolo: null });
    expect(result.maxPortfolioPhotosSolo).toBeNull();
  });
});

describe("canDisableFeature", () => {
  it("blocks disable when feature is inherited as `true`", () => {
    const state: FeatureUiState = {
      effectiveValue: true,
      isInherited: true,
      isOverridden: false,
      inheritedFromPlanId: "parent",
    };
    expect(canDisableFeature("hotSlots", state)).toBe(false);
  });

  it("allows disable when feature is locally overridden", () => {
    const state: FeatureUiState = {
      effectiveValue: true,
      isInherited: false,
      isOverridden: true,
      inheritedFromPlanId: null,
    };
    expect(canDisableFeature("hotSlots", state)).toBe(true);
  });

  it("allows toggling when feature is `false` (whatever the source)", () => {
    const state: FeatureUiState = {
      effectiveValue: false,
      isInherited: true,
      isOverridden: false,
      inheritedFromPlanId: "parent",
    };
    expect(canDisableFeature("hotSlots", state)).toBe(true);
  });
});

describe("deriveUiState", () => {
  it("marks local overrides as overridden, not inherited", () => {
    const plans: PlanNode[] = [
      { id: "free", inheritsFromPlanId: null, features: {} },
      {
        id: "pro",
        inheritsFromPlanId: "free",
        features: { hotSlots: true },
      },
    ];
    const map = new Map(plans.map((p) => [p.id, p]));
    const state = deriveUiState("pro", map);
    expect(state.hotSlots.effectiveValue).toBe(true);
    expect(state.hotSlots.isOverridden).toBe(true);
    expect(state.hotSlots.isInherited).toBe(false);
  });

  it("marks parent-provided values as inherited", () => {
    const plans: PlanNode[] = [
      {
        id: "free",
        inheritsFromPlanId: null,
        features: { hotSlots: true },
      },
      { id: "pro", inheritsFromPlanId: "free", features: {} },
    ];
    const map = new Map(plans.map((p) => [p.id, p]));
    const state = deriveUiState("pro", map);
    expect(state.hotSlots.effectiveValue).toBe(true);
    expect(state.hotSlots.isInherited).toBe(true);
    expect(state.hotSlots.isOverridden).toBe(false);
    expect(state.hotSlots.inheritedFromPlanId).toBe("free");
  });
});
