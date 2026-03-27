import { AppError } from "@/lib/api/errors";
import type { PlanFeatures } from "@/lib/billing/features";

export function canAccessClientCards(features: PlanFeatures | null | undefined): boolean {
  if (!features) return false;
  return Boolean(features.clientVisitHistory) || Boolean(features.clientNotes);
}

export function ensureClientCardAccess(features: PlanFeatures | null | undefined): void {
  if (canAccessClientCards(features)) return;
  throw new AppError("Заметки, теги и история доступны с тарифа PRO.", 403, "FEATURE_GATE", {
    feature: "clientVisitHistory",
    requiredPlan: "PRO",
  });
}
