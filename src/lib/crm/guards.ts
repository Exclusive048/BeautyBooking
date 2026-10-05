import { AppError } from "@/lib/api/errors";
import type { PlanFeatures, PlanTier } from "@/lib/billing/features";
import { cheapestPlanTierWithFeature } from "@/lib/billing/required-plan";

export function canAccessClientCards(features: PlanFeatures | null | undefined): boolean {
  if (!features) return false;
  return Boolean(features.clientVisitHistory) || Boolean(features.clientNotes);
}

const TIER_RANK: Record<PlanTier, number> = { FREE: 0, PRO: 1, PREMIUM: 2 };

/**
 * Карточку открывает любая из двух фич (`canAccessClientCards`), поэтому
 * подсказка — самый дешёвый тариф каталога хотя бы с одной из них
 * (MOBILE-POLISH, `billing/required-plan.ts`). Сейчас это PRO.
 */
export function clientCardRequiredPlan(): PlanTier | undefined {
  const tiers = [cheapestPlanTierWithFeature("clientVisitHistory"), cheapestPlanTierWithFeature("clientNotes")].filter(
    (tier): tier is PlanTier => tier !== undefined,
  );
  return tiers.sort((left, right) => TIER_RANK[left] - TIER_RANK[right])[0];
}

export function ensureClientCardAccess(features: PlanFeatures | null | undefined): void {
  if (canAccessClientCards(features)) return;
  const requiredPlan = clientCardRequiredPlan();
  throw new AppError(
    requiredPlan
      ? `Заметки, теги и история доступны с тарифа ${requiredPlan}.`
      : "Заметки, теги и история недоступны на вашем тарифе.",
    403,
    "FEATURE_GATE",
    { feature: "clientVisitHistory", requiredPlan },
  );
}
