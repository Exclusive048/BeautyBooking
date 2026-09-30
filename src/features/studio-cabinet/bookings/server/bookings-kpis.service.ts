import { BookingStatus, Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, localDayRangeUtc } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { MasterOption, StudioBookingsKpis } from "./types";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";

const NEEDS_ACTION_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.CHANGE_REQUESTED,
  BookingStatus.NEW,
];

function resolveRevenueKopeks(input: {
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

/**
 * Начало суток САЛОНА со сдвигом в днях (salon-tz, rule 17). Раньше плитки
 * «Сегодня», «Выручка сегодня», «7 дней» считались по UTC-суткам (29.09 · 02).
 */
function salonDayStart(now: Date, timeZone: string, offsetDays: number): Date {
  return localDayRangeUtc(addDaysToDateKey(toLocalDateKey(now, timeZone), offsetDays), timeZone)
    .startUtc;
}

/**
 * KPI strip aggregator for the journal page. All five tiles in
 * parallel; revenue delta vs. 30-day average uses the same proxy
 * formula as the dashboard (no historical snapshots yet).
 */
export async function loadStudioBookingsKpis(
  studioId: string,
): Promise<StudioBookingsKpis> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true, provider: { select: { timezone: true } } },
  });
  if (!studio) {
    return {
      todayCount: 0,
      todayCompleted: 0,
      todayUpcoming: 0,
      needsActionCount: 0,
      confirmedNext7Days: 0,
      revenueTodayKopeks: 0,
      revenueDeltaPercent: null,
      noShowLast7Days: 0,
    };
  }

  const baseScope: Prisma.BookingWhereInput = studioBookingsWhere(studio.id);

  const now = new Date();
  const timeZone = studio.provider.timezone;
  const todayStart = salonDayStart(now, timeZone, 0);
  const todayEnd = salonDayStart(now, timeZone, 1);
  const weekAhead = salonDayStart(now, timeZone, 7);
  const weekAgo = salonDayStart(now, timeZone, -6);
  const last30dStart = salonDayStart(now, timeZone, -29);

  const [
    todayBookings,
    needsActionCount,
    confirmedNext7Days,
    noShowLast7Days,
    last30dBookings,
  ] = await Promise.all([
    prisma.booking.findMany({
      where: {
        AND: [baseScope, { startAtUtc: { gte: todayStart, lt: todayEnd } }],
      },
      select: {
        id: true,
        startAtUtc: true,
        status: true,
        service: { select: { price: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
    }),
    prisma.booking.count({
      where: {
        AND: [
          baseScope,
          { status: { in: NEEDS_ACTION_STATUSES } },
          { startAtUtc: { gte: todayStart } },
        ],
      },
    }),
    prisma.booking.count({
      where: {
        AND: [
          baseScope,
          { status: BookingStatus.CONFIRMED },
          { startAtUtc: { gte: todayStart, lt: weekAhead } },
        ],
      },
    }),
    prisma.booking.count({
      where: {
        AND: [
          baseScope,
          { status: BookingStatus.NO_SHOW },
          { startAtUtc: { gte: weekAgo, lt: todayEnd } },
        ],
      },
    }),
    prisma.booking.findMany({
      where: {
        AND: [
          baseScope,
          { status: { notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW] } },
          { startAtUtc: { gte: last30dStart, lt: todayStart } },
        ],
      },
      select: {
        service: { select: { price: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
    }),
  ]);

  const todayCount = todayBookings.length;
  const todayCompleted = todayBookings.filter(
    (b) => b.status === BookingStatus.FINISHED,
  ).length;
  const todayUpcoming = todayBookings.filter(
    (b) => b.startAtUtc && b.startAtUtc.getTime() > now.getTime(),
  ).length;

  const revenueTodayKopeks = todayBookings
    .filter((b) => b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.REJECTED && b.status !== BookingStatus.NO_SHOW)
    .reduce((sum, b) => sum + resolveRevenueKopeks(b), 0);

  const last30dRevenue = last30dBookings.reduce(
    (sum, b) => sum + resolveRevenueKopeks(b),
    0,
  );
  const dailyAverage = last30dBookings.length > 0 ? last30dRevenue / 30 : 0;
  const revenueDeltaPercent =
    dailyAverage > 0
      ? Math.round(((revenueTodayKopeks - dailyAverage) / dailyAverage) * 100)
      : null;

  return {
    todayCount,
    todayCompleted,
    todayUpcoming,
    needsActionCount,
    confirmedNext7Days,
    revenueTodayKopeks,
    revenueDeltaPercent,
    noShowLast7Days,
  };
}

export async function loadStudioMasterOptions(
  studioId: string,
): Promise<MasterOption[]> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { providerId: true },
  });
  if (!studio) return [];
  const masters = await prisma.provider.findMany({
    where: { type: ProviderType.MASTER, studioId: studio.providerId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return masters.map((m) => ({ id: m.id, name: m.name }));
}
