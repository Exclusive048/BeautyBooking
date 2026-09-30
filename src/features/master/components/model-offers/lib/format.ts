/**
 * Display-only formatters for the 29a Master Model Offers page. Mirrors
 * the clients/lib/format.ts surface so the cabinet feels consistent.
 */

import { pickAvatarTone } from "@/components/ui/avatar-tones";

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

/** Цвет заглушки аватара — общая шкала `components/ui/avatar-tones.ts` (29.09 · 23). */
export function pickAvatarColor(seed: string): string {
  return pickAvatarTone(seed);
}
