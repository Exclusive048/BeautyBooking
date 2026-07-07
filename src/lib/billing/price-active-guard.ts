import { resolvePlanPrice } from "@/lib/billing/pricing";

/**
 * BILLING-PRICE-ACTIVE-UI-01 (R2-05-J) — guard against an admin `isActive`
 * toggle leaving an OFFERED plan×period with no resolvable price.
 *
 * A period is "offered" when the admin keeps a positive price for it (a zeroed
 * period is intentionally removed → resolver's monthly-fallback / not offered).
 * The resolvable (active) set is the positive rows whose toggle is on. If any
 * offered period then resolves to `null` via `resolvePlanPrice` (no active exact
 * row AND no active monthly anchor to derive from) the plan would become
 * un-purchasable for that period — deactivate is blocked, and the admin is
 * directed to zero-the-price (remove) instead.
 *
 * Pure (only `resolvePlanPrice`, itself pure) → unit-testable + reused by the
 * PATCH route as the authoritative server guard.
 */

export type PriceEntryInput = {
  periodMonths: number;
  priceKopeks: number;
  isActive?: boolean;
};

/**
 * @returns the first offered period that would become unresolvable, or `null`
 * when every offered period still resolves.
 */
export function findOrphanedOfferedPeriod(
  entries: ReadonlyArray<PriceEntryInput>,
): number | null {
  // Active resolvable rows: kept (positive) AND toggle on. `isActive` absent →
  // treated as active (matches create default + the UI always sends it).
  const activeRows = entries
    .filter((e) => e.priceKopeks > 0 && e.isActive !== false)
    .map((e) => ({ periodMonths: e.periodMonths, priceKopeks: e.priceKopeks }));

  // Offered periods = kept (positive) rows, regardless of toggle. A zeroed row
  // is an intentional removal → not offered.
  const offered = entries.filter((e) => e.priceKopeks > 0).map((e) => e.periodMonths);

  for (const period of offered) {
    if (resolvePlanPrice(activeRows, period) === null) return period;
  }
  return null;
}
