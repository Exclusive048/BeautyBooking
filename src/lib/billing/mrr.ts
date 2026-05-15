/**
 * MRR (Monthly Recurring Revenue) — pure function so it stays
 * unit-testable. Caller passes the subset of fields needed:
 *   - `priceKopeks` — the period price (3-mo = ~3× monthly etc)
 *   - `periodMonths` — billing cadence (1/3/6/12)
 *
 * MRR contribution per subscription is `priceKopeks / periodMonths`.
 * Sum across all active subscriptions = MRR.
 *
 * Lives under `src/lib/billing/` so both the admin-cabinet KPI
 * service AND the worker / snapshot pipeline can depend on it
 * without crossing the `lib/ → features/` boundary in the wrong
 * direction.
 */
export type MrrInput = {
  priceKopeks: number;
  periodMonths: number;
};

export function calculateMRR(subs: ReadonlyArray<MrrInput>): number {
  let total = 0;
  for (const s of subs) {
    if (s.periodMonths <= 0) continue;
    total += Math.round(s.priceKopeks / s.periodMonths);
  }
  return total;
}
