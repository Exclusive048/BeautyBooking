/**
 * Pure classification of a master's client into one or more status
 * buckets. Powers the 27a CRM page's tab counts and the badges on the
 * detail header. A single client can land in several buckets at once —
 * "VIP + Спящая" is a real combination ("once a high-LTV regular, hasn't
 * shown up in months").
 *
 * Thresholds are fixed at:
 *   - VIP:        LTV ≥ 50 000 ₽ (5 000 000 копеек)
 *   - Постоянная: ≥ 5 completed visits
 *   - Новая:      first visit < 30 days ago, OR no completed visits yet
 *   - Спящая:     ≥ 1 completed visit AND last visit > 90 days ago
 *
 * Pre-launch numbers — easy to dial in if the showcase data lands too
 * many or too few in any bucket.
 */

const VIP_LTV_KOPEKS = 5_000_000;
const REGULAR_VISIT_COUNT = 5;
const NEW_WINDOW_DAYS = 30;
const SLEEPING_AFTER_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ClientStatus = "new" | "regular" | "vip" | "sleeping";

export type ClientStats = {
  visits: number;
  ltv: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
};

function daysSince(date: Date | null, now: Date): number {
  if (!date) return Number.POSITIVE_INFINITY;
  const diff = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}

export function classifyClient(stats: ClientStats, now: Date = new Date()): ClientStatus[] {
  const out: ClientStatus[] = [];

  if (stats.ltv >= VIP_LTV_KOPEKS) out.push("vip");
  if (stats.visits >= REGULAR_VISIT_COUNT) out.push("regular");

  const isFreshArrival =
    (stats.firstVisitAt && daysSince(stats.firstVisitAt, now) < NEW_WINDOW_DAYS) ||
    stats.visits <= 1;
  if (isFreshArrival) out.push("new");

  if (stats.visits > 0 && daysSince(stats.lastVisitAt, now) > SLEEPING_AFTER_DAYS) {
    out.push("sleeping");
  }

  return out;
}

export const CLIENT_STATUS_THRESHOLDS = {
  VIP_LTV_KOPEKS,
  REGULAR_VISIT_COUNT,
  NEW_WINDOW_DAYS,
  SLEEPING_AFTER_DAYS,
} as const;
