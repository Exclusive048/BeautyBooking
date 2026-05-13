import type { ClientBookingDTO } from "@/lib/client-cabinet/bookings.service";

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
      const d = new Date(b.startAtUtc);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      label = `${MONTH_NAMES_RU[d.getMonth()]} ${d.getFullYear()}`;
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
