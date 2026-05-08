/**
 * Pure helpers for the 29a Master Model Offers page. Numbers in / numbers
 * out — no Prisma, no I/O, easy to unit-test if we ever start covering
 * this module. The view-service composes these on top of the raw rows.
 */

const RUBLE_FMT = new Intl.NumberFormat("ru-RU");
const RU_PLURAL = new Intl.PluralRules("ru-RU");

const MONTH_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

const WEEKDAY_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

/**
 * Compute the discount percentage of an offer relative to the master's
 * regular service price. Returns null when either side is missing or the
 * offer is at-or-above the regular price (we don't show "0%" or negative
 * discounts — masters can also publish offers at full price as a "casting"
 * with no discount, in which case the card shows just the price).
 */
export function computeOfferDiscountPct(input: {
  offerPrice: number | null;
  servicePrice: number | null;
}): number | null {
  const { offerPrice, servicePrice } = input;
  if (offerPrice === null || servicePrice === null) return null;
  if (!Number.isFinite(offerPrice) || !Number.isFinite(servicePrice)) return null;
  if (servicePrice <= 0 || offerPrice >= servicePrice) return null;
  const pct = ((servicePrice - offerPrice) / servicePrice) * 100;
  return Math.round(pct);
}

/**
 * Conversion = how many of an offer's applications ended up booked
 * (CONFIRMED). Rounded to a whole percent, returns null on zero
 * applications so the UI can render "—" instead of 0%.
 */
export function computeConversionRate(input: {
  total: number;
  confirmed: number;
}): number | null {
  if (input.total <= 0) return null;
  const pct = (input.confirmed / input.total) * 100;
  return Math.round(pct);
}

/** "12 мая · пн" — short, weekday-prefixed. Used in offer card heading. */
export function formatOfferDate(dateLocal: string, now: Date = new Date()): string {
  const target = parseLocalDate(dateLocal);
  if (!target) return dateLocal;
  const day = target.getDate();
  const month = MONTH_GENITIVE[target.getMonth()] ?? "";
  const weekday = WEEKDAY_SHORT[target.getDay()] ?? "";
  if (target.getFullYear() !== now.getFullYear()) {
    return `${day} ${month} ${target.getFullYear()} · ${weekday}`;
  }
  return `${day} ${month} · ${weekday}`;
}

export function formatRubles(kopeks: number | null): string {
  if (kopeks === null || !Number.isFinite(kopeks) || kopeks <= 0) return "—";
  return `${RUBLE_FMT.format(Math.round(kopeks / 100))} ₽`;
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const form = RU_PLURAL.select(n);
  if (form === "one") return one;
  if (form === "few") return few;
  return many;
}

function parseLocalDate(dateLocal: string): Date | null {
  // dateLocal is YYYY-MM-DD per ModelOffer schema. Construct as local time
  // so weekday math matches what the user sees in Asia/Almaty / their tz.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLocal);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}
