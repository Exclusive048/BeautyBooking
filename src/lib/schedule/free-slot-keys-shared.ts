import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";

/**
 * CATALOG-DATE-TIME-FILTER — общая (client-safe, без Prisma и движка) часть
 * снимка свободного времени: формат ключей и перевод фильтра «когда» в ключи.
 * Считает снимок `free-slot-keys.ts` (server-only), читает — каталог.
 */

/** Горизонт снимка: дни салона от сегодняшнего (30 — решение владельца 2026-09-24, было 14). */
export const FREE_SLOT_HORIZON_DAYS = 30;

/** Ключ часа салона: `2026-09-30T13` — окошко начинается в этот час. */
export function freeSlotHourKey(dateKey: string, hour: number): string {
  return `${dateKey}T${String(hour).padStart(2, "0")}`;
}

function parseMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Часы салона, в которые может НАЧАТЬСЯ окошко из диапазона `[from, to)`:
 * «Утро» 09:00–12:00 → 9, 10, 11. Пустой или перевёрнутый диапазон — `null`
 * (фильтра по времени нет).
 */
export function hoursForRange(timeFrom?: string, timeTo?: string): number[] | null {
  const from = parseMinutes(timeFrom);
  const to = parseMinutes(timeTo);
  if (from === null || to === null || to <= from) return null;
  const hours: number[] = [];
  for (let hour = Math.floor(from / 60); hour < Math.ceil(to / 60); hour += 1) hours.push(hour);
  return hours;
}

/**
 * Фильтр «когда» → ключи снимка (`Provider.freeSlotKeys`), подходит ЛЮБОЙ.
 * `null` — фильтра нет.
 *  - только дата → ключ дня;
 *  - дата и время → ключи часов этого дня;
 *  - только время → ключи часов на весь горизонт снимка. Дни берутся с запасом
 *    в сутки назад: ключи — дни салона, а «сегодня» считается по UTC.
 *
 * Дата — день САЛОНА каждого провайдера (rule 17): «30 сентября, утро» — это
 * утро 30-го по времени мастера, где бы ни был зритель.
 */
export function freeSlotKeysForWhen(input: {
  date?: string;
  timeFrom?: string;
  timeTo?: string;
  now: Date;
}): string[] | null {
  const date = input.date && isDateKey(input.date) ? input.date : null;
  const hours = hoursForRange(input.timeFrom, input.timeTo);
  if (!date && !hours) return null;
  if (date && !hours) return [date];

  const days = date
    ? [date]
    : Array.from({ length: FREE_SLOT_HORIZON_DAYS + 1 }, (_, index) =>
        addDaysToDateKey(input.now.toISOString().slice(0, 10), index - 1),
      );
  const keys: string[] = [];
  for (const day of days) {
    for (const hour of hours ?? []) keys.push(freeSlotHourKey(day, hour));
  }
  return keys;
}
