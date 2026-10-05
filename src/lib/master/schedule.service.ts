import { BookingStatus } from "@prisma/client";
import { cache } from "react";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { countClientFreeSlotsToday } from "@/lib/master/free-today";
import { prisma } from "@/lib/prisma";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import { getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import {
  BOOKING_WORK_CONTEXT_SELECT,
  resolveBookingWorkContext,
  shouldShowWorkContext,
  splitRevenueByWorkContext,
  type BookingWorkContext,
  type RevenueSplit,
} from "@/lib/bookings/work-context";
import {
  addWeeks,
  getWeekDays,
  hhmmToMinutes,
  toIsoDateKey,
  type WeekDay,
} from "@/lib/master/schedule-utils";
import type { MasterWorkProfiles } from "@/lib/master/access";

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
  /**
   * MASTER-BOOKING-UI-FIX-A: who must respond when the booking is in
   * `CHANGE_REQUESTED`. The action-menu uses this to show
   * approve/reject only to the awaited side and a «Ожидаем ответа»
   * guard to the initiator — without it, both sides saw the actions
   * and the initiator click hit the backend's «Action is required
   * from another side» 409.
   */
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /** STUDIO-MASTER-PROFILES (этап 3): личная запись или запись студии. */
  workContext: BookingWorkContext;
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
  /** MOBILE-MASTER-C: перерывы дня из плана движка (`DayPlan.breaks`), минуты от полуночи салона. */
  breaks: Array<{ startMin: number; endMin: number }>;
  /**
   * MOBILE-MASTER-C: день «Фиксированное время» — начала окошек `HH:MM` (время
   * салона); `null` — обычный день. Рабочее окно такого дня хранится как
   * 00:00–23:55 и часами работы не является.
   */
  fixedStarts: string[] | null;
  bookings: ScheduleBookingItem[];
  timeBlocks: ScheduleTimeBlockItem[];
};

export type ScheduleKpi = {
  weekBookingsCount: number;
  weekRevenue: number;
  /** STUDIO-MASTER-PROFILES: выручка недели по контекстам (личные / студия). */
  weekRevenueSplit: RevenueSplit;
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
  /** EXP-019: master (salon) tz — booking-card labels + footer time render in it, matching the grid. */
  timezone: string;
  /**
   * STUDIO-MASTER-PROFILES (этап 3): показывать ли пометку «Личная / Студия»
   * (`shouldShowWorkContext` — мастер работает и в студии либо есть студийные записи).
   */
  showWorkContext: boolean;
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

/**
 * Minute-of-day for grid card positioning, computed in the schedule
 * owner's OWN timezone (not the host process tz).
 *
 * QA-113 (FIX-11): `date.getHours()` reads the host process timezone.
 * On the MSK production host this happened to equal the master tz, so
 * the grid looked correct; on a UTC host the cards shifted by the tz
 * offset (e.g. −3h for Europe/Moscow) even though the availability
 * engine stayed TZ-safe (QA-07). Grid positions must be derived from
 * the entity's own tz to stay stable regardless of where the server
 * runs. GRID-ONLY: the availability engine never calls this helper —
 * its working intervals arrive as entity-local HH:MM strings.
 */
function minuteOfDay(date: Date, timeZone: string): number {
  const { hour, minute } = getLocalTimeParts(date, timeZone);
  return hour * 60 + minute;
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
  async (input: {
    masterId: string;
    weekStart: Date;
    /** STUDIO-MASTER-PROFILES (этап 4): записи всех рабочих профилей мастера. */
    workProfiles?: MasterWorkProfiles;
    now?: Date;
  }): Promise<ScheduleWeekData> => {
    const now = input.now ?? new Date();
    const weekEnd = addWeeks(input.weekStart, 1);

    const master = await prisma.provider.findUnique({
      where: { id: input.masterId },
      select: { id: true, timezone: true, studioId: true },
    });
    if (!master) {
      throw new Error(`Master not found: ${input.masterId}`);
    }

    // FIX-20 (QA-123): day-grouping + "today" computed in the MASTER's own
    // timezone, not the host process tz. On a UTC prod host, a booking in the
    // master's early-morning hours (east of UTC) otherwise lands in the previous
    // UTC day column. The vertical offset already uses master.timezone (FIX-11);
    // this is the sibling day-grouping axis. Slot generation is untouched.
    const todayIso = toLocalDateKey(now, master.timezone);
    const weekDays = getWeekDays(input.weekStart, now, todayIso);
    // MOBILE-MASTER-C (rule 17, salon-tz): границы выборки записей и блоков —
    // полночи САЛОНА первого дня и дня после последнего. Раньше это была
    // полночь процесса (`input.weekStart`): на UTC-хосте утро понедельника
    // мастера восточнее UTC (до 03:00 в Москве, до 10:00 во Владивостоке) в
    // неделю не попадало.
    const rangeStartUtc = localDayRangeUtc(weekDays[0]!.iso, master.timezone).startUtc;
    const rangeEndUtc = localDayRangeUtc(weekDays[weekDays.length - 1]!.iso, master.timezone).endExclusiveUtc;

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
          // F1: performer predicate — see master-booking-scope.ts.
          ...masterPerformedBookingWhere(input.workProfiles?.allIds ?? master.id),
          startAtUtc: { gte: rangeStartUtc, lt: rangeEndUtc },
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
          // MASTER-BOOKING-UI-FIX-A: needed for initiator-aware
          // actions on CHANGE_REQUESTED bookings (#2а).
          actionRequiredBy: true,
          service: { select: { name: true, title: true, price: true, durationMin: true } },
          serviceItems: { select: { priceSnapshot: true } },
          // STUDIO-MASTER-PROFILES (этап 3): где записали — лично или в студии.
          ...BOOKING_WORK_CONTEXT_SELECT,
        },
      }),
      prisma.timeBlock.findMany({
        where: {
          masterId: master.id,
          startAt: { lt: rangeEndUtc },
          endAt: { gt: rangeStartUtc },
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
            ...masterPerformedBookingWhere(input.workProfiles?.allIds ?? master.id),
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

    // Group bookings by day iso in the MASTER's own timezone (FIX-20/QA-123) —
    // `toLocalDateKey(startAtUtc, master.timezone)` so the column is correct on
    // a UTC host for an east-of-UTC master (was a host-tz `toIsoDateKey`).
    const bookingsByDay = new Map<string, ScheduleBookingItem[]>();
    for (const row of bookingRows) {
      if (!row.startAtUtc || !row.endAtUtc) continue;
      // FIX-20 (QA-123): group by the booking's day in the MASTER's tz.
      const iso = toLocalDateKey(row.startAtUtc, master.timezone);
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
        startMinuteOfDay: minuteOfDay(row.startAtUtc, master.timezone),
        endMinuteOfDay: minuteOfDay(row.endAtUtc, master.timezone),
        price: bookingPrice(row),
        actionRequiredBy: row.actionRequiredBy ?? null,
        workContext: resolveBookingWorkContext(row),
      };
      const list = bookingsByDay.get(iso) ?? [];
      list.push(item);
      bookingsByDay.set(iso, list);
    }

    const timeBlocksByDay = new Map<string, ScheduleTimeBlockItem[]>();
    for (const row of timeBlockRows) {
      // FIX-20 (QA-123): group by the block's day in the MASTER's tz.
      const iso = toLocalDateKey(row.startAt, master.timezone);
      const item: ScheduleTimeBlockItem = {
        id: row.id,
        type: row.type as "BREAK" | "BLOCK",
        note: row.note,
        startAtUtc: row.startAt,
        endAtUtc: row.endAt,
        startMinuteOfDay: minuteOfDay(row.startAt, master.timezone),
        endMinuteOfDay: minuteOfDay(row.endAt, master.timezone),
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
        breaks: plan.breaks.map((b) => parseInterval(b.start, b.end)),
        fixedStarts: plan.fixedStarts ?? null,
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
    const revenueBookings = allBookings.filter((b) => REVENUE_STATUSES.includes(b.rawStatus));
    const weekRevenue = revenueBookings.reduce((sum, b) => sum + b.price, 0);
    const weekRevenueSplit = splitRevenueByWorkContext(
      revenueBookings.map((b) => ({ context: b.workContext, amount: b.price })),
    );
    const showWorkContext = shouldShowWorkContext({
      masterInStudio: input.workProfiles?.worksInStudio ?? master.studioId !== null,
      contexts: allBookings.map((b) => b.workContext),
    });

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

    // DEV-SCENARIO-01: «Свободно сегодня» — окошки, которые клиент может
    // забронировать прямо сейчас (`free-today.ts`), а не куски рабочего окна.
    const { count: freeSlotsToday, firstFreeAt: firstFreeAfter } = await countClientFreeSlotsToday(
      master.id,
      now,
    );

    return {
      days,
      totalBookings,
      weekRevenue,
      kpi: {
        weekBookingsCount: totalBookings,
        weekRevenue,
        weekRevenueSplit,
        loadPct,
        totalWorkingHours,
        freeSlotsToday,
        firstFreeAfter,
      },
      hourRange,
      fetchedAt: now,
      timezone: master.timezone,
      showWorkContext,
    };
  },
);
