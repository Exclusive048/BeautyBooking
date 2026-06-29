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

// QA-107/FIX-22: bucket by the SALON-local month (entity tz), not the viewer's
// host tz — otherwise a late-evening booking near a month boundary lands in the
// wrong month for a cross-zone viewer. Returns {year, monthIndex0} in salon tz.
function salonYearMonth(iso: string, timeZone: string): { year: number; month0: number } {
  const date = new Date(iso);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(date);
    const year = Number(parts.find((p) => p.type === "year")?.value ?? date.getFullYear());
    const month0 = Number(parts.find((p) => p.type === "month")?.value ?? date.getMonth() + 1) - 1;
    return { year, month0 };
  } catch {
    return { year: date.getFullYear(), month0: date.getMonth() };
  }
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
