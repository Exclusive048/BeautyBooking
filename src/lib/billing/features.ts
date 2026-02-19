import {
  FEATURE_CATALOG,
  type BooleanFeatureKey,
  type FeatureKey,
  type LimitFeatureKey,
} from "@/lib/billing/feature-catalog";

export type PlanTier = "FREE" | "PRO" | "PREMIUM";

export type PlanFeatures = {
  [Key in BooleanFeatureKey]: boolean;
} & {
  [Key in LimitFeatureKey]: number | null;
};

export type PlanFeatureOverrides = {
  [Key in BooleanFeatureKey]?: true;
} & {
  [Key in LimitFeatureKey]?: number | null;
};

export type PlanNode = {
  id: string;
  inheritsFromPlanId: string | null;
  features: unknown;
};

export type FeatureUiState = {
  effectiveValue: boolean | number | null;
  isInherited: boolean;
  isOverridden: boolean;
  inheritedFromPlanId: string | null;
};

const DEFAULT_FEATURES: PlanFeatures = {
  onlineBooking: false,
  catalogListing: false,
  pwaPush: false,
  profilePublicPage: false,
  onlinePayments: false,
  hotSlots: false,
  analyticsCharts: false,
  financeReport: false,
  tgNotifications: false,
  vkNotifications: false,
  maxNotifications: false,
  smsNotifications: false,
  clientVisitHistory: false,
  clientNotes: false,
  clientImport: false,
  highlightCard: false,
  maxTeamMasters: 2,
  maxPortfolioPhotosSolo: 15,
  maxPortfolioPhotosStudioDesign: 15,
  maxPortfolioPhotosPerStudioMaster: 10,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseOverrides(raw: unknown): PlanFeatureOverrides {
  if (!isRecord(raw)) return {};
  const overrides: PlanFeatureOverrides = {};

  for (const key of Object.keys(FEATURE_CATALOG) as FeatureKey[]) {
    const def = FEATURE_CATALOG[key];
    const value = raw[key];
    if (def.kind === "boolean") {
      if (value === true) {
        overrides[key as BooleanFeatureKey] = true;
      }
      continue;
    }

    if (value === null) {
      overrides[key as LimitFeatureKey] = null;
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      overrides[key as LimitFeatureKey] = value;
    }
  }

  return overrides;
}

export function applyOverrides(base: PlanFeatures, overrides: PlanFeatureOverrides): PlanFeatures {
  const next: PlanFeatures = { ...base };
  for (const key of Object.keys(FEATURE_CATALOG) as FeatureKey[]) {
    const def = FEATURE_CATALOG[key];
    if (def.kind === "boolean") {
      if (overrides[key as BooleanFeatureKey]) {
        next[key as BooleanFeatureKey] = true;
      }
    } else if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      next[key as LimitFeatureKey] = overrides[key as LimitFeatureKey] ?? null;
    }
  }
  return next;
}

export function resolveEffectiveFeatures(
  planId: string,
  plansById: Map<string, PlanNode>,
  base: PlanFeatures = DEFAULT_FEATURES
): PlanFeatures {
  const visited = new Set<string>();
  const chain: PlanNode[] = [];
  let currentId: string | null = planId;
  const MAX_DEPTH = 8;

  for (let depth = 0; depth < MAX_DEPTH && currentId; depth += 1) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const plan = plansById.get(currentId);
    if (!plan) break;
    chain.push(plan);
    currentId = plan.inheritsFromPlanId ?? null;
  }

  let features = { ...base };
  for (const plan of chain.reverse()) {
    features = applyOverrides(features, parseOverrides(plan.features));
  }
  return features;
}

export function deriveUiState(
  planId: string,
  plansById: Map<string, PlanNode>
): Record<FeatureKey, FeatureUiState> {
  const plan = plansById.get(planId);
  const overrides = parseOverrides(plan?.features);
  const parentId = plan?.inheritsFromPlanId ?? null;
  const parentEffective = parentId
    ? resolveEffectiveFeatures(parentId, plansById, DEFAULT_FEATURES)
    : { ...DEFAULT_FEATURES };
  const effective = applyOverrides(parentEffective, overrides);

  const state: Record<FeatureKey, FeatureUiState> = {} as Record<FeatureKey, FeatureUiState>;

  for (const key of Object.keys(FEATURE_CATALOG) as FeatureKey[]) {
    const def = FEATURE_CATALOG[key];
    if (def.kind === "boolean") {
      const isOverridden = overrides[key as BooleanFeatureKey] === true;
      const isInherited = !isOverridden && parentId !== null && parentEffective[key as BooleanFeatureKey] === true;
      state[key] = {
        effectiveValue: effective[key as BooleanFeatureKey],
        isInherited,
        isOverridden,
        inheritedFromPlanId: isInherited ? parentId : null,
      };
      continue;
    }

    const isOverridden = Object.prototype.hasOwnProperty.call(overrides, key);
    const isInherited = !isOverridden && parentId !== null;
    state[key] = {
      effectiveValue: effective[key as LimitFeatureKey],
      isInherited,
      isOverridden,
      inheritedFromPlanId: isInherited ? parentId : null,
    };
  }

  return state;
}

export function canDisableFeature(key: BooleanFeatureKey, state: FeatureUiState): boolean {
  return !(state.isInherited && state.effectiveValue === true);
}

export function isRelaxedLimit(
  parentLimit: number | null | undefined,
  nextLimit: number | null
): boolean {
  if (parentLimit === undefined) return true;
  if (parentLimit === null) return nextLimit === null;
  if (nextLimit === null) return true;
  return nextLimit >= parentLimit;
}

export function getDefaultPlanFeatures(): PlanFeatures {
  return { ...DEFAULT_FEATURES };
}
