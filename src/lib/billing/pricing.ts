import { BILLING_YEARLY_DISCOUNT } from "@/lib/billing/constants";

export type PlanPriceRow = { periodMonths: number; priceKopeks: number };

/**
 * FIX-BC-1 — single source of truth for the charged amount (kopecks).
 *
 * Identical logic to the cabinet billing page's `getCheckoutAmountKopeks`
 * (`src/features/billing/components/billing-page.tsx`) — i.e. exactly what the
 * user is shown and agrees to. Used by BOTH checkout and renewal so signup and
 * renewal charge the **same** amount, and a missing period row is handled the
 * **same** way on both paths (previously: checkout silently ignored the stored
 * 12mo row / had no monthly fallback, and renewal required an exact row with no
 * fallback → could silently expire a paying subscriber).
 *
 * Pure + client-safe (only depends on the `BILLING_YEARLY_DISCOUNT` constant),
 * so it can be shared by the client billing page too.
 *
 * Missing-row policy (explicit, identical on both paths):
 *  - exact active period row present → that price (admin's explicit price wins);
 *  - else, if a monthly (1mo) active row exists → 12mo = `floor(monthly*12*(1-discount))`,
 *    other periods = `monthly * periodMonths`;
 *  - else → `null` (no monthly to derive from → the period is not priceable).
 *    Callers surface this consistently: checkout returns a 404 ("price not
 *    found"); renewal logs `RENEWAL_FAILED / MISSING_PRICE` + moves to the grace
 *    period (admin-surfaced) — never a silent grant and never a silent expiry of
 *    a subscriber whose period only lacked an explicit row (the monthly fallback
 *    now covers that case on both paths).
 *
 * @param activePrices the plan's **active** `BillingPlanPrice` rows
 * @param periodMonths the term being purchased/renewed (1|3|6|12)
 */
export function resolvePlanPrice(
  activePrices: ReadonlyArray<PlanPriceRow>,
  periodMonths: number,
): number | null {
  const exact = activePrices.find((p) => p.periodMonths === periodMonths);
  if (exact) return exact.priceKopeks;

  const monthly = activePrices.find((p) => p.periodMonths === 1)?.priceKopeks;
  if (monthly == null) return null;

  if (periodMonths === 12) {
    return Math.floor(monthly * 12 * (1 - BILLING_YEARLY_DISCOUNT));
  }
  return monthly * periodMonths;
}
