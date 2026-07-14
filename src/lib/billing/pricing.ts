import { BILLING_YEARLY_DISCOUNT } from "@/lib/billing/constants";
import { toKopeks, type Kopeks } from "@/lib/money/kopeks";

// Raw stored price row (a `BillingPlanPrice` DB read). `resolvePlanPrice` is the
// DB-read→domain boundary: it takes raw rows and BRANDS its resolved output —
// so callers pass Prisma rows unchanged and the resolved price is `Kopeks`.
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
/**
 * FIX-R2-05-B — a stored price counts as a real price only if it is a finite,
 * POSITIVE kopeks amount. A 0 / negative / non-finite value means "no explicit
 * price" → the resolver falls back (and ultimately to `null` if there is no
 * positive monthly to derive from). A paid period must NEVER resolve to 0/free
 * from an unset-or-zero row — a genuinely free plan is the FREE tier, not a
 * 0-priced PRO/PREMIUM period. (The admin edit dialog used to persist 0 rows for
 * untouched periods; combined with the old "return the row verbatim" this sold
 * 3/6/12-month terms free — "0 ₽ −100%" on /pricing.)
 */
function isPriceable(kopeks: number | null | undefined): kopeks is number {
  return typeof kopeks === "number" && Number.isFinite(kopeks) && kopeks > 0;
}

export function resolvePlanPrice(
  activePrices: ReadonlyArray<PlanPriceRow>,
  periodMonths: number,
): Kopeks | null {
  // Only an explicit POSITIVE row wins; a stored 0/non-positive row is treated as
  // "no price" and falls through to the monthly-derived fallback — identical on
  // checkout, renewal, and display (the FIX-BC-1-2 single-source invariant).
  const exact = activePrices.find((p) => p.periodMonths === periodMonths);
  if (exact && isPriceable(exact.priceKopeks)) return toKopeks(exact.priceKopeks);

  const monthly = activePrices.find((p) => p.periodMonths === 1)?.priceKopeks;
  if (!isPriceable(monthly)) return null;

  // Arithmetic widened to `number` → re-brand once at the return.
  if (periodMonths === 12) {
    return toKopeks(Math.floor(monthly * 12 * (1 - BILLING_YEARLY_DISCOUNT)));
  }
  return toKopeks(monthly * periodMonths);
}
