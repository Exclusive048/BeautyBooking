import { AppError } from "@/lib/api/errors";
import type { PlanTier } from "@/lib/billing/features";

export function canAccessClientCards(tier: PlanTier | null | undefined): boolean {
  if (!tier) return false;
  return tier !== "FREE";
}

export function ensureClientCardAccess(tier: PlanTier | null | undefined): void {
  if (canAccessClientCards(tier)) return;
  throw new AppError("Заметки, теги и история доступны с тарифа PRO.", 403, "FEATURE_GATE", {
    feature: "crm_client_cards",
    requiredPlan: "PRO",
  });
}
