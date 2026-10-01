import type { ClientBookingDTO } from "@/lib/client-cabinet/bookings.service";
import { toLocalMonthKey } from "@/lib/schedule/timezone";

const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export type MonthGroup = {
  key: string;
  label: string;
  bookings: ClientBookingDTO[];
};

// QA-107/FIX-22: bucket by the SALON-local month (entity tz), not the viewer's
// host tz — otherwise a late-evening booking near a month boundary lands in the
// wrong month for a cross-zone viewer. Returns {year, monthIndex0} in salon tz.
function salonYearMonth(iso: string, timeZone: string): { year: number; month0: number } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { year: Number.NaN, month0: Number.NaN };
  const [year, month] = toLocalMonthKey(date, timeZone).split("-").map(Number);
  return { year: year!, month0: month! - 1 };
}

/**
 * Group bookings by their YYYY-MM bucket while preserving incoming order.
 * Bookings without `startAtUtc` (rare — only NEW with no time yet) fall
 * into a single "Без даты" group rendered last.
 */
export function groupBookingsByMonth(bookings: ClientBookingDTO[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const indexByKey = new Map<string, number>();
  const undatedKey = "undated";

  for (const b of bookings) {
    let key: string;
    let label: string;
    if (b.startAtUtc) {
      const { year, month0 } = salonYearMonth(b.startAtUtc, b.provider.timezone);
      key = `${year}-${String(month0 + 1).padStart(2, "0")}`;
      label = `${MONTH_NAMES_RU[month0]} ${year}`;
    } else {
      key = undatedKey;
      label = "Без даты";
    }

    const existing = indexByKey.get(key);
    if (existing !== undefined) {
      groups[existing].bookings.push(b);
    } else {
      indexByKey.set(key, groups.length);
      groups.push({ key, label, bookings: [b] });
    }
  }

  return groups;
}
