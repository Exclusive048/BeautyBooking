import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toLocalDateKey } from "@/lib/schedule/timezone";

const ACTIVE_BOOKING_STATUSES_NOTIN = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

/** Pragmatic capacity per workday — same heuristic as the dashboard
 * occupancy proxy. Precise slot-engine integration is backlogged. */
const DAILY_CAPACITY = 5;

const WEEKDAY_LABELS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const;

export type WeekScheduleCell = {
  /** 1=Mon ... 7=Sun (matches WeeklyScheduleDay.weekday convention). */
  weekday: number;
  /** Two-letter label + day-of-month, e.g. «ПН 4». */
  dateLabel: string;
  booked: number;
  total: number;
  isDayOff: boolean;
  /** True for today's column. */
  isToday: boolean;
};

function startOfUtcWeekMonday(now: Date): Date {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + offsetToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Returns a 7-cell array (Mon..Sun) of occupancy for the current ISO
 * week. Each cell has booked / total / dayOff / today indicators.
 *
 * Strategy: query the master's `WeeklyScheduleConfig.days` once to find
 * which weekdays are "on" (drives `isDayOff`), then count bookings in
 * the Mon..Sun UTC window grouped by date. `total` per active day is
 * approximated as `DAILY_CAPACITY` (5) until the full schedule engine
 * slot-count helper is wired into this surface (BACKLOG).
 */
export async function getMasterWeekOccupancy(input: {
  providerId: string;
  now?: Date;
}): Promise<WeekScheduleCell[]> {
  const now = input.now ?? new Date();
  const weekStart = startOfUtcWeekMonday(now);
  const weekEnd = addUtcDays(weekStart, 7);

  const [provider, config, bookings] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: input.providerId },
      select: { timezone: true },
    }),
    prisma.weeklyScheduleConfig.findUnique({
      where: { providerId: input.providerId },
      select: { days: { select: { weekday: true, isActive: true } } },
    }),
    prisma.booking.findMany({
      where: {
        OR: [{ providerId: input.providerId }, { masterProviderId: input.providerId }],
        // Widen the UTC query window ±1 day: a booking whose *local* day falls in
        // this week can sit just outside the UTC week boundary (a salon-tz offset
        // shifts the instant up to ~12h). Day assignment below is by local date
        // key, so rows outside the 7 local days simply match no cell.
        startAtUtc: { gte: addUtcDays(weekStart, -1), lt: addUtcDays(weekEnd, 1) },
        status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
      },
      select: { startAtUtc: true },
    }),
  ]);

  // STUDIO-SCHEDULE-UTC-DAY-GROUPING: bucket bookings and resolve "today" in the
  // master's salon timezone via the shared `toLocalDateKey` primitive — not in
  // UTC. UTC date keys mis-bucket near-midnight bookings and mis-highlight the
  // "today" column for a non-UTC studio (+5/+7 etc.), the same divergence class
  // the master/client cabinets already closed (EXP-013/EXP-020). The week anchor
  // stays UTC-Monday; for the platform's RU (non-negative offset) market the
  // 7 UTC-midnight instants resolve to the correct Mon..Sun local dates.
  const timeZone = provider?.timezone ?? "Europe/Moscow";
  const todayKey = toLocalDateKey(now, timeZone);

  const activeWeekdays = new Set(
    (config?.days ?? []).filter((day) => day.isActive).map((day) => day.weekday),
  );

  const bookingsByLocalDay = new Map<string, number>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const key = toLocalDateKey(booking.startAtUtc, timeZone);
    bookingsByLocalDay.set(key, (bookingsByLocalDay.get(key) ?? 0) + 1);
  }

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const date = addUtcDays(weekStart, dayIndex);
    const weekday = dayIndex + 1; // 1=Mon ... 7=Sun
    const isDayOff = !activeWeekdays.has(weekday);
    const cellKey = toLocalDateKey(date, timeZone);
    const booked = bookingsByLocalDay.get(cellKey) ?? 0;
    const dayOfMonth = Number(cellKey.split("-")[2]);
    return {
      weekday,
      dateLabel: `${WEEKDAY_LABELS[dayIndex]} ${dayOfMonth}`,
      booked,
      total: isDayOff ? 0 : DAILY_CAPACITY,
      isDayOff,
      isToday: cellKey === todayKey,
    };
  });
}
