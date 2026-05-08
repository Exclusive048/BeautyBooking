/**
 * Display-only formatters for the 29a Master Model Offers page. Mirrors
 * the clients/lib/format.ts surface so the cabinet feels consistent.
 */

const RUBLE_FMT = new Intl.NumberFormat("ru-RU");
const RU_PLURAL = new Intl.PluralRules("ru-RU");

export function formatRubles(kopeks: number | null | undefined): string {
  if (kopeks === null || kopeks === undefined) return "—";
  if (!Number.isFinite(kopeks) || kopeks <= 0) return "—";
  return `${RUBLE_FMT.format(Math.round(kopeks / 100))} ₽`;
}

export function pluralize(
  n: number,
  one: string,
  few: string,
  many: string
): string {
  const form = RU_PLURAL.select(n);
  if (form === "one") return one;
  if (form === "few") return few;
  return many;
}

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

/** "12 мая · пн" — used in offer card heading. */
export function formatOfferDateHeading(
  dateLocal: string,
  now: Date = new Date()
): string {
  const target = parseDate(dateLocal);
  if (!target) return dateLocal;
  const day = target.getDate();
  const month = MONTH_GENITIVE[target.getMonth()] ?? "";
  const weekday = WEEKDAY_SHORT[target.getDay()] ?? "";
  if (target.getFullYear() !== now.getFullYear()) {
    return `${day} ${month} ${target.getFullYear()} · ${weekday}`;
  }
  return `${day} ${month} · ${weekday}`;
}

/** "12 мая" — short form for application "к окошку" reference. */
export function formatOfferDateShort(dateLocal: string): string {
  const target = parseDate(dateLocal);
  if (!target) return dateLocal;
  const day = target.getDate();
  const month = MONTH_GENITIVE[target.getMonth()] ?? "";
  return `${day} ${month}`;
}

function parseDate(dateLocal: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLocal);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

const AVATAR_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
] as const;

function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function pickAvatarColor(seed: string): string {
  return AVATAR_PALETTE[djb2(seed) % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0]!;
}
