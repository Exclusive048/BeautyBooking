import { BookingStatus } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import {
  addWeeks,
  getWeekDays,
  hhmmToMinutes,
  toIsoDateKey,
  type WeekDay,
} from "@/lib/master/schedule-utils";

const HOUR_PADDING = 1;
const FALLBACK_HOUR_START = 9;
const FALLBACK_HOUR_END = 20;

export type ScheduleBookingItem = {
  id: string;
  rawStatus: BookingStatus;
  /** "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "FINISHED" | "REJECTED" | "CHANGE_REQUESTED" */
  runtimeStatus: string;
  clientName: string;
  isNewClient: boolean;
  serviceTitle: string;
  /** Total service duration in minutes — used by the reschedule modal to compute new endAtUtc. */
  durationMin: number;
  startAtUtc: Date;
  endAtUtc: Date;
  /** Minutes from midnight (master tz) for the start — drives vertical positioning. */
  startMinuteOfDay: number;
  /** Minutes from midnight for the end. */
  endMinuteOfDay: number;
  price: number;
};

export type ScheduleTimeBlockItem = {
  id: string;
  type: "BREAK" | "BLOCK";
  note: string | null;
  startAtUtc: Date;
  endAtUtc: Date;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
};

export type ScheduleDay = {
  iso: string;
  weekDay: WeekDay;
  isOff: boolean;
  workingIntervals: Array<{ startMin: number; endMin: number }>;
  bookings: ScheduleBookingItem[];
  timeBlocks: ScheduleTimeBlockItem[];
};

export type ScheduleKpi = {
  weekBookingsCount: number;
  weekRevenue: number;
  loadPct: number;
  totalWorkingHours: number;
  freeSlotsToday: number;
  firstFreeAfter: string | null;
};

export type ScheduleWeekData = {
  days: ScheduleDay[];
  totalBookings: number;
  weekRevenue: number;
  kpi: ScheduleKpi;
  /** Computed dynamic hour range for the visible time grid (start/end in whole hours). */
  hourRange: { start: number; end: number };
  fetchedAt: Date;
};

const REVENUE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.PREPAID,
  BookingStatus.STARTED,
  BookingStatus.FINISHED,
];

function bookingPrice(item: {
  serviceItems: Array<{ priceSnapshot: number }>;
  service: { price: number };
}): number {
  if (item.serviceItems.length > 0) {
    return item.serviceItems.reduce((sum, si) => sum + si.priceSnapshot, 0);
  }
  return item.service.price;
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Compute the visible hour range for the week grid by scanning every
 * source that may need to fit on screen — working intervals, bookings,
 * and time blocks. Pads ±1 hour for visual breathing room. Falls back
 * to 9-20 when the week is completely empty (a brand-new master with
 * no schedule data).
 */
function computeDisplayHourRange(input: {
  workingIntervals: Array<{ startMin: number; endMin: number }>;
  bookings: ScheduleBookingItem[];
  timeBlocks: ScheduleTimeBlockItem[];
}): { start: number; end: number } {
  let minMin = Number.POSITIVE_INFINITY;
  let maxMin = Number.NEGATIVE_INFINITY;

  for (const w of input.workingIntervals) {
    if (w.startMin < minMin) minMin = w.startMin;
    if (w.endMin > maxMin) maxMin = w.endMin;
  }
  for (const b of input.bookings) {
    if (b.startMinuteOfDay < minMin) minMin = b.startMinuteOfDay;
    if (b.endMinuteOfDay > maxMin) maxMin = b.endMinuteOfDay;
  }
  for (const tb of input.timeBlocks) {
    if (tb.startMinuteOfDay < minMin) minMin = tb.startMinuteOfDay;
    if (tb.endMinuteOfDay > maxMin) maxMin = tb.endMinuteOfDay;
  }

  if (!Number.isFinite(minMin) || !Number.isFinite(maxMin)) {
    return { start: FALLBACK_HOUR_START, end: FALLBACK_HOUR_END };
  }

  const startHour = Math.max(0, Math.floor(minMin / 60) - HOUR_PADDING);
  const endHour = Math.min(24, Math.ceil(maxMin / 60) + HOUR_PADDING);
  return { start: startHour, end: endHour };
}

function parseInterval(s: string, e: string): { startMin: number; endMin: number } {
  return { startMin: hhmmToMinutes(s), endMin: hhmmToMinutes(e) };
}

/**
 * Free 30-minute slots inside today's working window after `now`, minus
 * existing bookings and time blocks. Used by the dashboard-style "Свободно
 * сегодня" KPI on the schedule page.
 */
function computeFreeSlotsToday(input: {
  today: ScheduleDay | undefined;
  now: Date;
}): { count: number; firstFreeAfter: string | null } {
  if (!input.today || input.today.isOff) return { count: 0, firstFreeAfter: null };
  const nowMin = minuteOfDay(input.now);
  let count = 0;
  let firstFree: string | null = null;
  const occupied: Array<{ startMin: number; endMin: number }> = [
    ...input.today.bookings.map((b) => ({
      startMin: b.startMinuteOfDay,
      endMin: b.endMinuteOfDay,
    })),
    ...input.today.timeBlocks.map((tb) => ({
      startMin: tb.startMinuteOfDay,
      endMin: tb.endMinuteOfDay,
    })),
  ];

  for (const w of input.today.workingIntervals) {
    const slotStart = Math.max(w.startMin, nowMin);
    for (let m = slotStart; m + 30 <= w.endMin; m += 30) {
      const conflict = occupied.some((o) => m < o.endMin && m + 30 > o.startMin);
      if (!conflict) {
        count++;
        if (firstFree === null) {
          const hh = String(Math.floor(m / 60)).padStart(2, "0");
          const mm = String(m % 60).padStart(2, "0");
          firstFree = `${hh}:${mm}`;
        }
      }
    }
  }
  return { count, firstFreeAfter: firstFree };
}

/**
 * Single round-trip data load for the week view:
 *   - DayPlan × 7 in parallel (working intervals + breaks via ScheduleEngine)
 *   - All bookings inside the week range
 *   - Visit counts (one `groupBy` to flag new clients)
 *   - Time blocks intersecting the week
 *   - Aggregated KPI (revenue, load, free slots today)
 *   - Dynamic hour range computed from the union of every source
 *
 * `React.cache` so any sibling server component can call again for free.
 */
export const getMasterScheduleWeek = cache(
  async (input: { masterId: string; weekStart: Date; now?: Date }): Promise<ScheduleWeekData> => {
    const now = input.now ?? new Date();
    const weekEnd = addWeeks(input.weekStart, 1);
    const weekDays = getWeekDays(input.weekStart, now);
    const todayIso = toIsoDateKey(now);

    const master = await prisma.provider.findUnique({
      where: { id: input.masterId },
      select: { id: true, timezone: true },
    });
    if (!master) {
      throw new Error(`Master not found: ${input.masterId}`);
    }

    // Day plans, bookings, and time blocks all in one parallel batch.
    const ctx = await ScheduleEngine.createContext({
      providerId: master.id,
      timezoneHint: master.timezone,
      range: {
        fromKey: weekDays[0]!.iso,
        toKeyExclusive: toIsoDateKey(weekEnd),
      },
    });

    const [dayPlans, bookingRows, timeBlockRows] = await Promise.all([
      Promise.all(weekDays.map((d) => ScheduleEngine.getDayPlanFromContext(ctx, d.iso))),
      prisma.booking.findMany({
        where: {
          providerId: master.id,
          startAtUtc: { gte: input.weekStart, lt: weekEnd },
          status: {
            notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.NO_SHOW],
          },
        },
        orderBy: { startAtUtc: "asc" },
        select: {
          id: true,
          status: true,
          startAtUtc: true,
          endAtUtc: true,
          clientName: true,
          clientUserId: true,
          service: { select: { name: true, title: true, price: true, durationMin: true } },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
      prisma.timeBlock.findMany({
        where: {
          masterId: master.id,
          startAt: { lt: weekEnd },
          endAt: { gt: input.weekStart },
        },
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          type: true,
          note: true,
        },
      }),
    ]);

    const clientUserIds = Array.from(
      new Set(
        bookingRows.map((b) => b.clientUserId).filter((id): id is string => Boolean(id)),
      ),
    );

    const visitCounts = clientUserIds.length
      ? await prisma.booking.groupBy({
          by: ["clientUserId"],
          where: {
            providerId: master.id,
            clientUserId: { in: clientUserIds },
            status: BookingStatus.FINISHED,
          },
          _count: { _all: true },
        })
      : [];
    const visitCountByClient = new Map<string, number>();
    for (const row of visitCounts) {
      if (row.clientUserId) visitCountByClient.set(row.clientUserId, row._count._all);
    }

    // Group bookings by day iso. We assume booking startAt and the week-day
    // share the same calendar day in the master timezone — for an MVP this
    // is the same boundary the seed data uses, so timezone subtleties don't
    // bite. Production callers running in foreign locales will want the
    // master.timezone applied via Intl.DateTimeFormat here.
    const bookingsByDay = new Map<string, ScheduleBookingItem[]>();
    for (const row of bookingRows) {
      if (!row.startAtUtc || !row.endAtUtc) continue;
      const iso = toIsoDateKey(row.startAtUtc);
      const visitCount = row.clientUserId
        ? visitCountByClient.get(row.clientUserId) ?? 0
        : 0;
      const item: ScheduleBookingItem = {
        id: row.id,
        rawStatus: row.status,
        runtimeStatus: resolveBookingRuntimeStatus({
          status: row.status,
          startAtUtc: row.startAtUtc,
          endAtUtc: row.endAtUtc,
          now,
        }),
        clientName: row.clientName,
        isNewClient: row.clientUserId ? visitCount === 0 : false,
        serviceTitle: row.service.title?.trim() || row.service.name,
        durationMin: row.service.durationMin,
        startAtUtc: row.startAtUtc,
        endAtUtc: row.endAtUtc,
        startMinuteOfDay: minuteOfDay(row.startAtUtc),
        endMinuteOfDay: minuteOfDay(row.endAtUtc),
        price: bookingPrice(row),
      };
      const list = bookingsByDay.get(iso) ?? [];
      list.push(item);
      bookingsByDay.set(iso, list);
    }

    const timeBlocksByDay = new Map<string, ScheduleTimeBlockItem[]>();
    for (const row of timeBlockRows) {
      const iso = toIsoDateKey(row.startAt);
      const item: ScheduleTimeBlockItem = {
        id: row.id,
        type: row.type as "BREAK" | "BLOCK",
        note: row.note,
        startAtUtc: row.startAt,
        endAtUtc: row.endAt,
        startMinuteOfDay: minuteOfDay(row.startAt),
        endMinuteOfDay: minuteOfDay(row.endAt),
      };
      const list = timeBlocksByDay.get(iso) ?? [];
      list.push(item);
      timeBlocksByDay.set(iso, list);
    }

    const days: ScheduleDay[] = weekDays.map((wd, i) => {
      const plan = dayPlans[i]!;
      const intervals = plan.workingIntervals.map((w) => parseInterval(w.start, w.end));
      return {
        iso: wd.iso,
        weekDay: wd,
        isOff: !plan.isWorking,
        workingIntervals: intervals,
        bookings: bookingsByDay.get(wd.iso) ?? [],
        timeBlocks: timeBlocksByDay.get(wd.iso) ?? [],
      };
    });

    const allWorkingIntervals = days.flatMap((d) => d.workingIntervals);
    const allBookings = days.flatMap((d) => d.bookings);
    const allTimeBlocks = days.flatMap((d) => d.timeBlocks);
    const hourRange = computeDisplayHourRange({
      workingIntervals: allWorkingIntervals,
      bookings: allBookings,
      timeBlocks: allTimeBlocks,
    });

    const totalBookings = allBookings.length;
    const weekRevenue = allBookings
      .filter((b) => REVENUE_STATUSES.includes(b.rawStatus))
      .reduce((sum, b) => sum + b.price, 0);

    const totalWorkingMinutes = allWorkingIntervals.reduce(
      (sum, w) => sum + (w.endMin - w.startMin),
      0,
    );
    const totalBookedMinutes = allBookings.reduce(
      (sum, b) => sum + (b.endMinuteOfDay - b.startMinuteOfDay),
      0,
    );
    const loadPct = totalWorkingMinutes > 0
      ? Math.round((totalBookedMinutes / totalWorkingMinutes) * 100)
      : 0;
    const totalWorkingHours = Math.round(totalWorkingMinutes / 60);

    const today = days.find((d) => d.iso === todayIso);
    const { count: freeSlotsToday, firstFreeAfter } = computeFreeSlotsToday({
      today,
      now,
    });

    return {
      days,
      totalBookings,
      weekRevenue,
      kpi: {
        weekBookingsCount: totalBookings,
        weekRevenue,
        loadPct,
        totalWorkingHours,
        freeSlotsToday,
        firstFreeAfter,
      },
      hourRange,
      fetchedAt: now,
    };
  },
);
