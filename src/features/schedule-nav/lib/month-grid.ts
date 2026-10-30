import { addDaysToDateKey, parseDateKeyParts } from "@/lib/schedule/dateKey";

/**
 * SCHEDULE-FLEX-DATE-NAV — календарная арифметика выбора даты расписания.
 * Только ключи дат салона `YYYY-MM-DD` (UTC-tech): ни пояса зрителя, ни
 * пояса процесса здесь нет, поэтому подпись и сетка не съезжают на сутки.
 */

/** 0 = понедельник … 6 = воскресенье. */
export function weekdayMondayFirst(dateKey: string): number {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

/** Понедельник недели, в которую входит дата. */
export function mondayOf(dateKey: string): string {
  return addDaysToDateKey(dateKey, -weekdayMondayFirst(dateKey));
}

/** `YYYY-MM` месяца даты. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Сдвиг месяца `YYYY-MM` на `delta` месяцев. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7)) - 1 + delta;
  const shiftedYear = year + Math.floor(month / 12);
  const shiftedMonth = ((month % 12) + 12) % 12;
  return `${shiftedYear}-${String(shiftedMonth + 1).padStart(2, "0")}`;
}

/** Год и номер месяца (1…12) ключа `YYYY-MM`. */
export function monthParts(monthKey: string): { year: number; month: number } {
  return { year: Number(monthKey.slice(0, 4)), month: Number(monthKey.slice(5, 7)) };
}

/**
 * Клетки месяца неделями с понедельника: ключ даты либо `null` (клетка до
 * первого или после последнего дня месяца). Длина кратна 7.
 */
export function monthCells(monthKey: string): Array<string | null> {
  const first = `${monthKey}-01`;
  const cells: Array<string | null> = Array.from({ length: weekdayMondayFirst(first) }, () => null);
  let key = first;
  while (key.startsWith(monthKey)) {
    cells.push(key);
    key = addDaysToDateKey(key, 1);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Ключ даты корректен (а не просто похож на `YYYY-MM-DD`). */
export function isValidDateKey(value: string | null | undefined): value is string {
  if (!value) return false;
  const parts = parseDateKeyParts(value);
  if (!parts) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}
