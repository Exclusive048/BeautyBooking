/**
 * Money helpers. Backend stores `priceKopeks: Int`; UI displays rubles.
 * Helpers here are pure functions so they can be unit-tested without
 * dragging Intl polyfills (Node's Intl module is enough).
 */

const RUB_NO_DECIMALS = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const RUB_AT_MOST_2 = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

/** "12 500 ₽" — non-breaking thin space thousands. Defensive to
 * fractional kopeks (rounds half-up to whole rubles). */
export function formatRublesFromKopeks(kopeks: number): string {
  return RUB_NO_DECIMALS.format(Math.round(kopeks / 100));
}

/** "12 500,50 ₽" — used in the price editor where partial kopeks
 * matter. Falls back to whole rubles when the fractional part is
 * zero (avoids the "0 ₽" → "0,00 ₽" UX downgrade). */
export function formatRublesPrecise(kopeks: number): string {
  return RUB_AT_MOST_2.format(kopeks / 100);
}

/** Parses admin-entered rubles ("3500" / "3500.50" / "3 500,50") into
 * kopeks. Returns `null` on garbage input — callers should surface
 * a validation error rather than silently fall back. */
export function parseRublesToKopeks(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  if (cleaned.length === 0) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** "4.2 млн ₽" — shorthand for huge KPI numbers. Mirrors the
 * abbreviated format used on the admin dashboard's revenue card. */
export function formatRublesShort(kopeks: number): string {
  const rubles = kopeks / 100;
  if (rubles >= 1_000_000) {
    return `${(rubles / 1_000_000).toFixed(1).replace(".0", "")} млн ₽`;
  }
  if (rubles >= 1_000) {
    return `${(rubles / 1_000).toFixed(1).replace(".0", "")} тыс ₽`;
  }
  return RUB_NO_DECIMALS.format(Math.round(rubles));
}
