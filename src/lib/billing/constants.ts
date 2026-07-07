import type { PlanTier } from "@prisma/client";

export const BILLING_PERIODS = [1, 3, 6, 12] as const;
export const BILLING_YEARLY_DISCOUNT = 0.2;

export type BillingPeriodMonths = (typeof BILLING_PERIODS)[number];

export const PAST_DUE_GRACE_DAYS = 7;

// BILLING-RENEWAL-OPTIN-02 (R2-05-C-v2): on a renewal PRICE INCREASE the cron
// enters a 2-day opt-in window (PAST_DUE + graceUntil = deadline) instead of
// auto-charging the higher amount. Reused as the opt-in deadline; a subscriber
// who doesn't accept the new price by then lapses via the normal expiry path.
export const PRICE_OPTIN_GRACE_DAYS = 2;

/**
 * BC-CAP — canonical studio team-size cap per plan tier (single source of truth).
 *
 * `maxTeamMasters` lives per-plan in `BillingPlan.features` (admin-managed for
 * PRO/PREMIUM via /admin/billing). This map is the CANONICAL default applied
 * where a plan is BORN: the FREE seed (`plan-seed.ts`), the test-data seed, and
 * the admin plan-CREATE backstop (a STUDIO plan created without an explicit
 * `maxTeamMasters` inherits its tier default instead of silently falling to the
 * global DEFAULT_FEATURES floor of 2 = the FREE cap). It is also the defensive
 * fallback in `ensureStudioTeamLimit` when a studio has no resolvable owner.
 *
 * `null` = unlimited (honored by the enforcement path).
 *
 * Values are product-confirmed (Artem, BILLING-CAP-01-FIX): FREE=2 / PRO=6 / PREMIUM=20.
 */
export const STUDIO_TEAM_CAP_BY_TIER: Record<PlanTier, number | null> = {
  FREE: 2,
  PRO: 6,
  PREMIUM: 20,
};
