import { PlanTier, SubscriptionScope } from "@prisma/client";
import { UI_TEXT } from "@/lib/ui/text";

const TIER = UI_TEXT.adminPanel.billing.tier;
const SCOPE = UI_TEXT.adminPanel.billing.scope;

export function tierLabel(tier: PlanTier): string {
  if (tier === PlanTier.PREMIUM) return TIER.premium;
  if (tier === PlanTier.PRO) return TIER.pro;
  return TIER.free;
}

export function scopeLabel(scope: SubscriptionScope): string {
  return scope === SubscriptionScope.STUDIO ? SCOPE.studio : SCOPE.master;
}

/** "Premium · Studio" — used as a sub-caption under plan name on the
 * card. Provides unambiguous "which Premium are we looking at" hint
 * when the canonical `BillingPlan.name` doesn't already encode scope. */
export function tierAndScopeLabel(
  tier: PlanTier,
  scope: SubscriptionScope,
): string {
  return `${tierLabel(tier)} · ${scopeLabel(scope)}`;
}

/** PREMIUM-tier plans get the "POPULAR" feature ribbon — historically
 * the conversion driver in admin/billing dashboards. Surfaced via
 * `isFeatured` on the card type so this rule lives in one place. */
export function isFeaturedTier(tier: PlanTier): boolean {
  return tier === PlanTier.PREMIUM;
}
