import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * Rolling-window period helpers for the master analytics surface (30a).
 *
 * Distinct from the shared `resolvePresetRange` in `features/analytics`
 * which uses month-to-date / quarter-to-date semantics — the master
 * cabinet shows truly rolling windows ("за последние 30 дней"). We
 * compute `from/to` here and pass them as `period: "custom"` to the
 * existing `resolveRangeWithCompare`, so we don't fork the studio
 * surface's range math.
 */

export type MasterAnalyticsPeriodId = "7d" | "30d" | "90d" | "year" | "custom";

const VALID_PERIODS: ReadonlySet<MasterAnalyticsPeriodId> = new Set([
  "7d",
  "30d",
  "90d",
  "year",
  "custom",
]);

const PERIOD_DAYS: Record<Exclude<MasterAnalyticsPeriodId, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  year: 365,
};

export function parseAnalyticsPeriod(value: string | null | undefined): MasterAnalyticsPeriodId {
  if (value && VALID_PERIODS.has(value as MasterAnalyticsPeriodId)) {
    return value as MasterAnalyticsPeriodId;
  }
  return "30d";
}

export function parseComparisonFlag(value: string | null | undefined): boolean {
  // Default ON. Anything other than the explicit "off" sentinel keeps
  // comparison turned on — survives accidental empties / typos.
  return value !== "off";
}

export type RollingRange = {
  /** Inclusive `YYYY-MM-DD` */
  fromKey: string;
  /** Inclusive `YYYY-MM-DD` */
  toKey: string;
};

/**
 * Returns inclusive [fromKey, toKey] for the chosen rolling window.
 * `custom` is intentionally a placeholder in 30a — alerted as "Доступно
 * скоро" in the UI; if it leaks through, we fall back to `30d`.
 */
export function computeRollingRange(
  period: Exclude<MasterAnalyticsPeriodId, "custom">,
  timeZone: string,
  now: Date = new Date()
): RollingRange {
  const todayKey = toLocalDateKey(now, timeZone);
  const days = PERIOD_DAYS[period];
  const fromKey = addDaysToDateKey(todayKey, -(days - 1));
  return { fromKey, toKey: todayKey };
}

/**
 * Previous range = same length, ending the day before the current
 * range starts. Used for the comparison overlay on the revenue chart
 * and the trend deltas on KPI cards.
 */
export function computePreviousRange(range: RollingRange): RollingRange {
  // Defensive: bail out cleanly if upstream sends garbage; the call
  // site already validates against `isDateKey` but we don't want
  // a typo to throw deep in the aggregator.
  if (!isDateKey(range.fromKey) || !isDateKey(range.toKey)) {
    return range;
  }
  const prevToKey = addDaysToDateKey(range.fromKey, -1);
  // Length-of-current minus 1 (because the toKey day is inclusive).
  const days = diffInclusiveDays(range.fromKey, range.toKey);
  const prevFromKey = addDaysToDateKey(prevToKey, -(days - 1));
  return { fromKey: prevFromKey, toKey: prevToKey };
}

function diffInclusiveDays(fromKey: string, toKey: string): number {
  // Both are calendar dates in `YYYY-MM-DD` shape; tiny string→Date
  // conversion is fine, we don't need timezone math here.
  const from = new Date(`${fromKey}T00:00:00Z`);
  const to = new Date(`${toKey}T00:00:00Z`);
  const diffMs = to.getTime() - from.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

const MONTHS_GENITIVE = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
] as const;

/**
 * "03 апр – 02 мая 2026" — used in the period bar's right-aligned
 * display. Dates that span a year boundary keep both years visible.
 */
export function formatPeriodDisplay(range: RollingRange): string {
  const from = parseDateKey(range.fromKey);
  const to = parseDateKey(range.toKey);
  if (!from || !to) return `${range.fromKey} — ${range.toKey}`;
  const sameYear = from.year === to.year;
  const fromText = `${pad2(from.day)} ${MONTHS_GENITIVE[from.month - 1]}${
    sameYear ? "" : ` ${from.year}`
  }`;
  const toText = `${pad2(to.day)} ${MONTHS_GENITIVE[to.month - 1]} ${to.year}`;
  return `${fromText} — ${toText}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
