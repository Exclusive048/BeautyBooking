import { PlanTier, SubscriptionScope } from "@prisma/client";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.users.plan;

export function formatTierLabel(tier: PlanTier): string {
  if (tier === PlanTier.PREMIUM) return T.tierPremium;
  if (tier === PlanTier.PRO) return T.tierPro;
  return T.tierFree;
}

export function formatScopeLabel(scope: SubscriptionScope): string {
  return scope === SubscriptionScope.STUDIO ? T.scopeStudio : T.scopeMaster;
}

/** "Premium Studio" / "PRO Master" / "Free Master". Used inside the
 * plan pill in the table row. */
export function formatPlanName(
  tier: PlanTier,
  scope: SubscriptionScope,
): string {
  return `${formatTierLabel(tier)} ${formatScopeLabel(scope)}`;
}
