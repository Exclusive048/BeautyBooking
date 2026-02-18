import { prisma } from "@/lib/prisma";

export type PlanTier = "FREE" | "PRO" | "PREMIUM";
export type CatalogPriority = PlanTier;

export type PlanFeatures = {
  onlinePayments: boolean;
  hotSlots: boolean;
  analyticsCharts: boolean;
  financeReport: boolean;
  tgNotifications: boolean;
  vkNotifications: boolean;
  maxNotifications: boolean;
  smsNotifications: boolean;
  clientVisitHistory: boolean;
  clientNotes: boolean;
  clientImport: boolean;
  catalogPriority: CatalogPriority;
  highlightCard: boolean;
  maxTeamMasters: number | null;
  maxPortfolioPhotosSolo: number | null;
  maxPortfolioPhotosStudioDesign: number | null;
  maxPortfolioPhotosPerStudioMaster: number | null;
};

type BooleanFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends boolean ? Key : never;
}[keyof PlanFeatures];

type LimitFeatureKey = {
  [Key in keyof PlanFeatures]: PlanFeatures[Key] extends number | null ? Key : never;
}[keyof PlanFeatures];

const FREE_DEFAULT_FEATURES: PlanFeatures = {
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
  catalogPriority: "FREE",
  highlightCard: false,
  maxTeamMasters: 2,
  maxPortfolioPhotosSolo: 15,
  maxPortfolioPhotosStudioDesign: 15,
  maxPortfolioPhotosPerStudioMaster: 10,
};

const CATALOG_PRIORITY_SET = new Set<CatalogPriority>(["FREE", "PRO", "PREMIUM"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBoolean(record: Record<string, unknown>, key: keyof PlanFeatures): boolean | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readNumberOrNull(
  record: Record<string, unknown>,
  key: keyof PlanFeatures
): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCatalogPriority(record: Record<string, unknown>): CatalogPriority | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, "catalogPriority")) return undefined;
  const value = record.catalogPriority;
  if (typeof value !== "string") return undefined;
  const normalized = value.toUpperCase();
  return CATALOG_PRIORITY_SET.has(normalized as CatalogPriority)
    ? (normalized as CatalogPriority)
    : undefined;
}

function extractPlanOverrides(raw: unknown): Partial<PlanFeatures> {
  if (!isRecord(raw)) return {};
  const record = raw;
  const overrides: Partial<PlanFeatures> = {};

  const booleanKeys: Array<BooleanFeatureKey> = [
    "onlinePayments",
    "hotSlots",
    "analyticsCharts",
    "financeReport",
    "tgNotifications",
    "vkNotifications",
    "maxNotifications",
    "smsNotifications",
    "clientVisitHistory",
    "clientNotes",
    "clientImport",
    "highlightCard",
  ];

  for (const key of booleanKeys) {
    const value = readBoolean(record, key);
    if (typeof value === "boolean") overrides[key] = value;
  }

  const limitKeys: Array<LimitFeatureKey> = [
    "maxTeamMasters",
    "maxPortfolioPhotosSolo",
    "maxPortfolioPhotosStudioDesign",
    "maxPortfolioPhotosPerStudioMaster",
  ];

  for (const key of limitKeys) {
    const value = readNumberOrNull(record, key);
    if (value !== undefined) overrides[key] = value;
  }

  const catalogPriority = readCatalogPriority(record);
  if (catalogPriority) overrides.catalogPriority = catalogPriority;

  return overrides;
}

export function parsePlanFeatures(raw: unknown): PlanFeatures {
  const overrides = extractPlanOverrides(raw);
  return deepMergeFeatures(FREE_DEFAULT_FEATURES, overrides);
}

export function deepMergeFeatures(
  base: PlanFeatures,
  override: Partial<PlanFeatures>
): PlanFeatures {
  return {
    onlinePayments: override.onlinePayments ?? base.onlinePayments,
    hotSlots: override.hotSlots ?? base.hotSlots,
    analyticsCharts: override.analyticsCharts ?? base.analyticsCharts,
    financeReport: override.financeReport ?? base.financeReport,
    tgNotifications: override.tgNotifications ?? base.tgNotifications,
    vkNotifications: override.vkNotifications ?? base.vkNotifications,
    maxNotifications: override.maxNotifications ?? base.maxNotifications,
    smsNotifications: override.smsNotifications ?? base.smsNotifications,
    clientVisitHistory: override.clientVisitHistory ?? base.clientVisitHistory,
    clientNotes: override.clientNotes ?? base.clientNotes,
    clientImport: override.clientImport ?? base.clientImport,
    catalogPriority: override.catalogPriority ?? base.catalogPriority,
    highlightCard: override.highlightCard ?? base.highlightCard,
    maxTeamMasters:
      override.maxTeamMasters !== undefined ? override.maxTeamMasters : base.maxTeamMasters,
    maxPortfolioPhotosSolo:
      override.maxPortfolioPhotosSolo !== undefined
        ? override.maxPortfolioPhotosSolo
        : base.maxPortfolioPhotosSolo,
    maxPortfolioPhotosStudioDesign:
      override.maxPortfolioPhotosStudioDesign !== undefined
        ? override.maxPortfolioPhotosStudioDesign
        : base.maxPortfolioPhotosStudioDesign,
    maxPortfolioPhotosPerStudioMaster:
      override.maxPortfolioPhotosPerStudioMaster !== undefined
        ? override.maxPortfolioPhotosPerStudioMaster
        : base.maxPortfolioPhotosPerStudioMaster,
  };
}

export async function resolveEffectiveFeatures(planId: string): Promise<PlanFeatures> {
  const visited = new Set<string>();
  const chain: Array<{ id: string; inheritsFromPlanId: string | null; features: unknown }> = [];
  let currentId: string | null = planId;
  const MAX_DEPTH = 5;

  for (let depth = 0; depth < MAX_DEPTH && currentId; depth += 1) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const plan: { id: string; inheritsFromPlanId: string | null; features: unknown } | null =
      await prisma.billingPlan.findUnique({
        where: { id: currentId },
        select: { id: true, inheritsFromPlanId: true, features: true },
      });
    if (!plan) break;
    chain.push(plan);
    currentId = plan.inheritsFromPlanId ?? null;
  }

  let features = { ...FREE_DEFAULT_FEATURES };
  for (const plan of chain.reverse()) {
    const overrides = extractPlanOverrides(plan.features);
    features = deepMergeFeatures(features, overrides);
  }

  return features;
}

export function can(features: PlanFeatures, key: BooleanFeatureKey): boolean {
  return Boolean(features[key]);
}

export function getLimit(features: PlanFeatures, key: LimitFeatureKey): number | null {
  return features[key] ?? null;
}

export function getDefaultPlanFeatures(): PlanFeatures {
  return { ...FREE_DEFAULT_FEATURES };
}
