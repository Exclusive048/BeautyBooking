import type { SubscriptionScope, PlanTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { get, set } from "@/lib/cache/cache";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";
import { resolveEffectiveFeatures, type PlanNode } from "@/lib/billing/features";

/**
 * Single source of truth for marketing prices on /pricing and <PricingTeaser>.
 *
 * Reads BillingPlan + BillingPlanPrice rows admin manages via /admin/billing,
 * applies feature inheritance via resolveEffectiveFeatures (the same helper
 * used everywhere else in the billing stack), and returns a flat shape ready
 * for the UI.
 *
 * Returns `null` for tiers the admin hasn't set up yet — frontend renders a
 * "Уточняется" placeholder so /pricing and /become-master never crash on a
 * partially-configured environment.
 *
 * Cached 30 s in shared cache. Admin price edits propagate within that window.
 */

const CACHE_KEY = "marketing:pricing:v1";
const CACHE_TTL_SECONDS = 30;

export type MarketingPlanPrice = {
  periodMonths: number;
  priceKopeks: number;
};

export type MarketingPlan = {
  code: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  /** Resolved feature map — booleans + limit numbers, with inheritance applied. */
  features: Record<FeatureKey, boolean | number | null>;
  /** All active price points (1, 3, 6, 12 months). FREE plans have empty array. */
  prices: ReadonlyArray<MarketingPlanPrice>;
  /** Convenience flag — `tier === "FREE"`. */
  isFreePlan: boolean;
};

export type MarketingPricingResult = {
  master: {
    free: MarketingPlan | null;
    pro: MarketingPlan | null;
    premium: MarketingPlan | null;
  };
  studio: {
    free: MarketingPlan | null;
    pro: MarketingPlan | null;
    premium: MarketingPlan | null;
  };
};

type CachedShape = MarketingPricingResult;

function buildKey(scope: SubscriptionScope, tier: PlanTier): string {
  return `${scope}_${tier}`;
}

async function load(): Promise<MarketingPricingResult> {
  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      code: true,
      tier: true,
      scope: true,
      inheritsFromPlanId: true,
      features: true,
      prices: {
        where: { isActive: true },
        select: { periodMonths: true, priceKopeks: true },
        orderBy: { periodMonths: "asc" },
      },
    },
  });

  const planMap = new Map<string, PlanNode>(
    plans.map((p) => [p.id, { id: p.id, inheritsFromPlanId: p.inheritsFromPlanId, features: p.features }]),
  );

  const byKey = new Map<string, MarketingPlan>();

  for (const plan of plans) {
    const resolved = resolveEffectiveFeatures(plan.id, planMap) as Record<
      FeatureKey,
      boolean | number | null
    >;

    byKey.set(buildKey(plan.scope, plan.tier), {
      code: plan.code,
      tier: plan.tier,
      scope: plan.scope,
      features: resolved,
      prices: plan.prices,
      isFreePlan: plan.tier === "FREE",
    });
  }

  return {
    master: {
      free: byKey.get(buildKey("MASTER", "FREE")) ?? null,
      pro: byKey.get(buildKey("MASTER", "PRO")) ?? null,
      premium: byKey.get(buildKey("MASTER", "PREMIUM")) ?? null,
    },
    studio: {
      free: byKey.get(buildKey("STUDIO", "FREE")) ?? null,
      pro: byKey.get(buildKey("STUDIO", "PRO")) ?? null,
      premium: byKey.get(buildKey("STUDIO", "PREMIUM")) ?? null,
    },
  };
}

export async function getMarketingPricing(): Promise<MarketingPricingResult> {
  const cached = await get<CachedShape>(CACHE_KEY);
  if (cached) return cached;

  const fresh = await load();
  await set(CACHE_KEY, fresh, CACHE_TTL_SECONDS);
  return fresh;
}

/**
 * Pre-computed savings versus paying month-by-month for `periodMonths`.
 * Returns `null` when there is no monthly price to compare against, the
 * period is 1, or there is no actual saving (e.g. flat per-month rate).
 */
export function calcSavingsPercent(
  monthlyKopeks: number | undefined,
  periodKopeks: number,
  periodMonths: number,
): number | null {
  if (!monthlyKopeks || monthlyKopeks <= 0 || periodMonths === 1) return null;
  const fullPrice = monthlyKopeks * periodMonths;
  if (fullPrice === 0) return null;
  const saved = Math.round((1 - periodKopeks / fullPrice) * 100);
  return saved > 0 ? saved : null;
}

/**
 * Resolves the price entry for a given period from a plan. Falls back to
 * `null` so the UI can show "Уточняется" gracefully.
 */
export function findPrice(
  plan: MarketingPlan | null,
  periodMonths: number,
): MarketingPlanPrice | null {
  if (!plan) return null;
  return plan.prices.find((p) => p.periodMonths === periodMonths) ?? null;
}

/**
 * Lists feature keys (with FEATURE_CATALOG metadata) included in the plan,
 * filtered to the plan's scope (or BOTH). Used in <PricingTeaser> short list.
 */
export function listIncludedFeatures(
  plan: MarketingPlan,
  limit: number = 6,
): Array<{ key: FeatureKey; title: string }> {
  const out: Array<{ key: FeatureKey; title: string; uiOrder: number }> = [];
  for (const [key, def] of Object.entries(FEATURE_CATALOG)) {
    if (def.appliesTo !== "BOTH" && def.appliesTo !== plan.scope) continue;
    const value = plan.features[key as FeatureKey];
    const enabled = typeof value === "boolean" ? value : typeof value === "number" ? value > 0 : false;
    if (!enabled) continue;
    out.push({ key: key as FeatureKey, title: def.title, uiOrder: def.uiOrder });
  }
  out.sort((a, b) => a.uiOrder - b.uiOrder);
  return out.slice(0, limit).map(({ key, title }) => ({ key, title }));
}
