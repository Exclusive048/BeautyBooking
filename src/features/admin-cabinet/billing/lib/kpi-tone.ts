import type { AdminBillingKpiTone } from "@/features/admin-cabinet/billing/types";

/** Sign-based tone for percent deltas — positive growth is `ok`,
 * decline is `danger`, missing data is `neutral`. */
export function tonefromDelta(deltaPercent: number | null): AdminBillingKpiTone {
  if (deltaPercent === null) return "neutral";
  if (deltaPercent > 0) return "ok";
  if (deltaPercent < 0) return "danger";
  return "neutral";
}

/** Pending payments: any pending volume is `warn` (admin should
 * keep an eye), zero is `ok`. We don't escalate to `danger` because
 * pending is an expected transient state — only volume matters. */
export function toneForPending(count: number): AdminBillingKpiTone {
  if (count === 0) return "ok";
  return "warn";
}

/** Failed-payment percent thresholds.
 *   - 0% (or no data) → ok
 *   - 0% < x ≤ 5% → warn
 *   - > 5% → danger
 *
 * Tuned to the (no-data, healthy, problem) bands an admin actually
 * cares about — most healthy environments see < 2% gateway-level
 * failures. */
export function toneForFailureRate(
  percent: number | null,
): AdminBillingKpiTone {
  if (percent === null) return "neutral";
  if (percent <= 0) return "ok";
  if (percent <= 5) return "warn";
  return "danger";
}
