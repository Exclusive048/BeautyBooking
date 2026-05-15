import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

  const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

  const [config, bookings] = await Promise.all([
    prisma.weeklyScheduleConfig.findUnique({
      where: { providerId: input.providerId },
      select: { days: { select: { weekday: true, isActive: true } } },
    }),
    prisma.booking.findMany({
      where: {
        OR: [{ providerId: input.providerId }, { masterProviderId: input.providerId }],
        startAtUtc: { gte: weekStart, lt: weekEnd },
        status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
      },
      select: { startAtUtc: true },
    }),
  ]);

  const activeWeekdays = new Set(
    (config?.days ?? []).filter((day) => day.isActive).map((day) => day.weekday),
  );

  const bookingsByDay = new Map<number, number>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const offset = Math.floor(
      (booking.startAtUtc.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (offset < 0 || offset > 6) continue;
    bookingsByDay.set(offset, (bookingsByDay.get(offset) ?? 0) + 1);
  }

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const date = addUtcDays(weekStart, dayIndex);
    const weekday = dayIndex + 1; // 1=Mon ... 7=Sun
    const isDayOff = !activeWeekdays.has(weekday);
    const booked = bookingsByDay.get(dayIndex) ?? 0;
    const cellKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    return {
      weekday,
      dateLabel: `${WEEKDAY_LABELS[dayIndex]} ${date.getUTCDate()}`,
      booked,
      total: isDayOff ? 0 : DAILY_CAPACITY,
      isDayOff,
      isToday: cellKey === todayKey,
    };
  });
}
