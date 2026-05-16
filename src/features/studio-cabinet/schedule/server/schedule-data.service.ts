import {
  BookingStatus,
  ProviderType,
  type TimeBlockType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { bookingToneFromStatus } from "../lib/booking-status-display";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  addUtcDays,
  isSameUtcDay,
  parseDateKey,
  startOfUtcDay,
  toDateKey,
} from "../lib/time-grid";
import type {
  ScheduleBookingCell,
  ScheduleBreakCell,
  ScheduleDayData,
  ScheduleKpis,
  ScheduleMasterColumn,
  ScheduleWeekData,
  ScheduleWeekDay,
  ScheduleWeekRow,
  StudioScheduleData,
} from "./types";

/**
 * Studio admin booking operations (create/move/cancel) are DIRECT —
 * no `ScheduleChangeRequest` approval needed. Admin has authority over
 * studio bookings.
 *
 * `ScheduleChangeRequest` approval flow
 * (STUDIO-SCHEDULE-REQUEST-APPROVAL-A) applies ONLY to master-initiated
 * working-hours / day-off changes, NOT to individual booking
 * operations. This service therefore reads/writes Booking and
 * TimeBlock tables directly; the approval queue lives on a separate
 * page (`/cabinet/studio/schedule-requests`).
 */

const ACTIVE_BOOKING_STATUSES_NOTIN = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

const DAILY_CAPACITY = 5;

function startOfUtcWeekMonday(now: Date): Date {
  const day = now.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + offset);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function resolveBookingPriceKopeks(input: {
  service: { price: number } | null;
  serviceItems: Array<{ priceSnapshot: number }>;
}): number {
  const snapshotSum = input.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.priceSnapshot),
    0,
  );
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, input.service?.price ?? 0);
}

async function buildDayData(
  studioId: string,
  providerId: string,
  dateKey: string,
): Promise<ScheduleDayData> {
  const dayStart = startOfUtcDay(parseDateKey(dateKey));
  const dayEnd = addUtcDays(dayStart, 1);

  const [masters, bookings, blocks] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: providerId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        isPublished: true,
        ownerUserId: true,
        ratingAvg: true,
        ratingCount: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        OR: [{ studioId }, { providerId }],
        startAtUtc: { gte: dayStart, lt: dayEnd },
        status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
      },
      select: {
        id: true,
        masterProviderId: true,
        providerId: true,
        serviceId: true,
        startAtUtc: true,
        endAtUtc: true,
        status: true,
        clientName: true,
        clientPhone: true,
        clientUserId: true,
        service: { select: { name: true, title: true, price: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
      orderBy: { startAtUtc: "asc" },
    }),
    prisma.timeBlock.findMany({
      where: {
        studioId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: {
        id: true,
        masterId: true,
        startAt: true,
        endAt: true,
        type: true,
        note: true,
      },
    }),
  ]);

  // Per-master first-time-client detection — a single grouped query
  // gives every client's earliest booking in the studio; the booking
  // on the current day is "new" if its id matches the earliest.
  const clientKeys = bookings
    .map((booking) => booking.clientUserId)
    .filter((value): value is string => Boolean(value));
  const earliestByClient = new Map<string, string>();
  if (clientKeys.length > 0) {
    const earliest = await prisma.booking.findMany({
      where: {
        OR: [{ studioId }, { providerId }],
        clientUserId: { in: clientKeys },
      },
      orderBy: { startAtUtc: "asc" },
      select: { id: true, clientUserId: true },
    });
    for (const row of earliest) {
      if (!row.clientUserId) continue;
      if (!earliestByClient.has(row.clientUserId)) {
        earliestByClient.set(row.clientUserId, row.id);
      }
    }
  }

  // STUDIO-BUGS-FIX-A bug #5: INVITED masters (no ownerUserId) render as
  // disabled columns — they cannot accept bookings until the invite is
  // accepted. `isStudioMasterActive` covers both ownership + isPublished.
  const columns: ScheduleMasterColumn[] = masters.map((master) => ({
    id: master.id,
    name: master.name,
    avatarUrl: master.avatarUrl ?? null,
    rating: master.ratingAvg ?? 0,
    reviewsCount: master.ratingCount ?? 0,
    isAvailable: isStudioMasterActive(master),
  }));

  const bookingCells: ScheduleBookingCell[] = bookings
    .filter((b) => b.startAtUtc && b.endAtUtc)
    .map((b) => {
      const masterId = b.masterProviderId ?? b.providerId;
      const isNew =
        b.clientUserId !== null &&
        earliestByClient.get(b.clientUserId) === b.id;
      return {
        id: b.id,
        masterId,
        startAtUtc: b.startAtUtc!.toISOString(),
        endAtUtc: b.endAtUtc!.toISOString(),
        status: b.status,
        tone: isNew && bookingToneFromStatus(b.status) === "confirmed"
          ? "new"
          : bookingToneFromStatus(b.status),
        clientName: b.clientName,
        clientPhone: b.clientPhone || null,
        isNewClient: isNew,
        serviceTitle: b.service?.title?.trim() || b.service?.name || "Услуга",
        serviceId: b.serviceId,
        priceKopeks: resolveBookingPriceKopeks(b),
      };
    });

  const breakCells: ScheduleBreakCell[] = blocks.map((block) => ({
    id: block.id,
    masterId: block.masterId,
    startAtUtc: block.startAt.toISOString(),
    endAtUtc: block.endAt.toISOString(),
    type: block.type as TimeBlockType,
    note: block.note,
  }));

  return {
    dateKey,
    dayStartIso: dayStart.toISOString(),
    columns,
    bookings: bookingCells,
    breaks: breakCells,
  };
}

function computeKpis(day: ScheduleDayData): ScheduleKpis {
  const completed = day.bookings.filter(
    (b) =>
      b.status === BookingStatus.CONFIRMED ||
      b.status === BookingStatus.PREPAID ||
      b.status === BookingStatus.STARTED ||
      b.status === BookingStatus.IN_PROGRESS ||
      b.status === BookingStatus.FINISHED,
  );
  const confirmedCount = completed.length;
  const totalCount = day.bookings.length;
  const revenue = day.bookings.reduce(
    (sum, b) => sum + b.priceKopeks,
    0,
  );

  const onShift = day.columns.filter((column) => column.isAvailable);
  const occupancyDenominator = onShift.length * DAILY_CAPACITY;
  const occupancy =
    occupancyDenominator > 0
      ? Math.min(Math.round((totalCount / occupancyDenominator) * 100), 100)
      : 0;

  return {
    bookingsCount: totalCount,
    bookingsConfirmedCount: confirmedCount,
    revenueKopeks: revenue,
    occupancyPercent: occupancy,
    occupancyHoursDenominator: occupancyDenominator,
    mastersOnShift: onShift.length,
    freeWindowsCount: Math.max(occupancyDenominator - totalCount, 0),
  };
}

const WEEKDAY_SHORT_RU = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const;

async function buildWeekData(
  studioId: string,
  providerId: string,
  dateKey: string,
): Promise<ScheduleWeekData> {
  const target = parseDateKey(dateKey);
  const weekStart = startOfUtcWeekMonday(target);
  const weekEnd = addUtcDays(weekStart, 7);
  const today = startOfUtcDay(new Date());

  const [masters, bookings] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: providerId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        isPublished: true,
        ownerUserId: true,
        ratingAvg: true,
        ratingCount: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        OR: [{ studioId }, { providerId }],
        startAtUtc: { gte: weekStart, lt: weekEnd },
        status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
      },
      select: {
        masterProviderId: true,
        providerId: true,
        startAtUtc: true,
      },
    }),
  ]);

  const days: ScheduleWeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = addUtcDays(weekStart, index);
    return {
      dateKey: toDateKey(date),
      weekdayLabel: WEEKDAY_SHORT_RU[index],
      dayNumber: date.getUTCDate(),
      isToday: isSameUtcDay(date, today),
    };
  });

  const countsByMasterAndDay = new Map<string, Map<string, number>>();
  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const offset = Math.floor(
      (booking.startAtUtc.getTime() - weekStart.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (offset < 0 || offset > 6) continue;
    const dayKey = days[offset]!.dateKey;
    const masterId = booking.masterProviderId ?? booking.providerId;
    const byDay = countsByMasterAndDay.get(masterId) ?? new Map<string, number>();
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
    countsByMasterAndDay.set(masterId, byDay);
  }

  // STUDIO-BUGS-FIX-A bug #5: INVITED masters get zero capacity + isDayOff
  // across the whole week. They surface in the grid so admin sees they
  // exist, but with no schedulable hours.
  const rows: ScheduleWeekRow[] = masters.map((master) => {
    const active = isStudioMasterActive(master);
    const byDay = countsByMasterAndDay.get(master.id) ?? new Map();
    return {
      master: {
        id: master.id,
        name: master.name,
        avatarUrl: master.avatarUrl ?? null,
        rating: master.ratingAvg ?? 0,
        reviewsCount: master.ratingCount ?? 0,
        isAvailable: active,
      },
      cells: days.map((day) => {
        const booked = byDay.get(day.dateKey) ?? 0;
        const capacity = active ? DAILY_CAPACITY : 0;
        const percent =
          capacity > 0 ? Math.min(Math.round((booked / capacity) * 100), 100) : 0;
        return {
          dateKey: day.dateKey,
          booked,
          capacity,
          percent,
          isDayOff: !active,
        };
      }),
    };
  });

  return { days, rows };
}

async function loadServices(
  studioId: string,
  providerId: string,
): Promise<StudioScheduleData["services"]> {
  const [services, masterServices] = await Promise.all([
    prisma.service.findMany({
      where: { studioId, isEnabled: true },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.masterService.findMany({
      where: {
        isEnabled: true,
        masterProvider: { type: ProviderType.MASTER, studioId: providerId },
      },
      select: { masterProviderId: true, serviceId: true },
    }),
  ]);

  const mastersByService = new Map<string, string[]>();
  for (const link of masterServices) {
    const arr = mastersByService.get(link.serviceId) ?? [];
    arr.push(link.masterProviderId);
    mastersByService.set(link.serviceId, arr);
  }

  return services.map((service) => ({
    id: service.id,
    name: service.title?.trim() || service.name,
    durationMin: service.durationMin,
    priceKopeks: service.price,
    masterIds: mastersByService.get(service.id) ?? [],
  }));
}

export async function loadStudioScheduleData(input: {
  studioId: string;
  dateKey: string;
  view: "day" | "week";
}): Promise<StudioScheduleData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new Error(`Studio not found: ${input.studioId}`);
  }

  const [day, services, week] = await Promise.all([
    buildDayData(studio.id, studio.providerId, input.dateKey),
    loadServices(studio.id, studio.providerId),
    input.view === "week"
      ? buildWeekData(studio.id, studio.providerId, input.dateKey)
      : Promise.resolve(null),
  ]);

  return {
    dateKey: input.dateKey,
    view: input.view,
    day,
    kpis: computeKpis(day),
    week,
    services,
  };
}

void DAY_START_HOUR;
void DAY_END_HOUR;
