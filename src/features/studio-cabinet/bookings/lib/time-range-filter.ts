import { addDaysToDateKey, localDayRangeUtc } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export type BookingsTimeRange = "today" | "tomorrow" | "week" | "all";

export function parseBookingsTimeRange(value: unknown): BookingsTimeRange {
  return value === "tomorrow" || value === "week" || value === "all"
    ? value
    : "today";
}

/**
 * Chip «Сегодня / Завтра / Неделя» → `{ from, toExclusive }`. `"all"` —
 * без границ (фильтр не ставится).
 *
 * tz-источник — **salon-tz** (пояс студии, rule 17): сутки салона, а не UTC.
 * Раньше границы брались по UTC-полуночи, и у студии в Екатеринбурге (GMT+5)
 * запись на 03:00 завтрашнего дня попадала в «Сегодня», а с 00:00 до 05:00 по
 * салону «Сегодня» показывало вчерашние записи (29.09 доработки · 02).
 */
export function bookingsTimeRangeBounds(
  range: BookingsTimeRange,
  timeZone: string,
  now: Date = new Date(),
): { from: Date | null; toExclusive: Date | null } {
  const todayKey = toLocalDateKey(now, timeZone);
  const dayStart = (offset: number) =>
    localDayRangeUtc(addDaysToDateKey(todayKey, offset), timeZone).startUtc;
  switch (range) {
    case "today":
      return { from: dayStart(0), toExclusive: dayStart(1) };
    case "tomorrow":
      return { from: dayStart(1), toExclusive: dayStart(2) };
    case "week":
      return { from: dayStart(0), toExclusive: dayStart(7) };
    case "all":
    default:
      return { from: null, toExclusive: null };
  }
}
