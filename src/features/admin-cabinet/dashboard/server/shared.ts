import "server-only";

/**
 * Server-side formatters and date helpers shared across the dashboard
 * services. Keeping them in one file means the same "currency in rubles"
 * / "tabular thousands" output renders identically in KPI, chart-summary
 * and event-feed contexts.
 */

const RUB = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const RUB_DECIMAL = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 1,
});

const COUNT_FMT = new Intl.NumberFormat("ru-RU");

/** Returns `[startOfDayUtc, startOfNextDayUtc]` shifted by `daysAgo`. */
export function utcDayRange(daysAgo = 0): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** Inclusive range `[start, end)` covering the last `N` UTC days ending
 * today (so `N=7` returns "today + previous 6 days"). */
export function utcLastNDays(n: number): { start: Date; end: Date } {
  const { end } = utcDayRange(0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - n);
  return { start, end };
}

/** Calendar-month UTC window for `monthsAgo` (0 = current). */
export function utcMonthRange(monthsAgo = 0): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - monthsAgo + 1,
      1,
      0,
      0,
      0,
    ),
  );
  return { start, end };
}

/** "1 412" — non-breaking thin-space thousands, locale-aware. */
export function formatCount(value: number): string {
  return COUNT_FMT.format(value);
}

/** "9 800 ₽" for kopeks input. Defensive against negatives — passes the
 * sign through (used for refund display in the events feed). */
export function formatRublesFromKopeks(kopeks: number): string {
  return RUB.format(kopeks / 100);
}

/** "4.2 млн ₽" — millions for the platform-revenue KPI tile. Falls back
 * to plain rubles below the million threshold so a freshly-launched
 * environment doesn't display "0.0 млн ₽". */
export function formatRevenueShort(kopeks: number): string {
  const rubles = kopeks / 100;
  if (rubles >= 1_000_000) {
    return `${RUB_DECIMAL.format(rubles / 1_000_000).replace("₽", "млн ₽")}`;
  }
  if (rubles >= 1_000) {
    return `${RUB_DECIMAL.format(rubles / 1_000).replace("₽", "тыс ₽")}`;
  }
  return RUB.format(rubles);
}

/** Returns sign + percentage-change text, or `null` when previous period
 * is zero (division by zero produces a meaningless delta). */
export function computePercentDelta(
  current: number,
  previous: number,
): { text: string | null; sign: "positive" | "negative" | "zero" | null } {
  if (previous === 0) return { text: null, sign: null };
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: "0%", sign: "zero" };
  const sign = rounded > 0 ? "positive" : "negative";
  return { text: `${rounded > 0 ? "+" : ""}${rounded}%`, sign };
}

/** Returns "+24" / "−12" / null. Use for counters where percent doesn't
 * make sense (e.g. active subscriptions). */
export function computeAbsoluteDelta(
  current: number,
  previous: number,
): { text: string | null; sign: "positive" | "negative" | "zero" | null } {
  const diff = current - previous;
  if (diff === 0) return { text: "0", sign: "zero" };
  const sign = diff > 0 ? "positive" : "negative";
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`, sign };
}

/** ISO day-precision key, UTC. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Анна Сергеевна Иванова" → "Анна И.". Used in the live feed where
 * we want to identify clients without exposing full PII to admin
 * sessions. Single given name passes through unchanged. */
export function maskLastName(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}
