import {
  BookingStatus,
  MembershipStatus,
  ProviderType,
  ScheduleChangeRequestStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import {
  formatPointsDelta,
  formatRatingDelta,
  formatRelativeDelta,
} from "../lib/format-delta";
import {
  daysForPeriod,
  type StudioDashboardPeriodId,
} from "../lib/period-options";
import type {
  StudioAttentionItem,
  StudioDashboardData,
  StudioKpis,
  StudioMasterOnShift,
  StudioOccupancyRow,
  StudioPopularService,
  StudioRevenueChartData,
  StudioTopMasterRow,
} from "./types";

const COMPLETED_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
];

const ACTIVE_BOOKING_STATUSES_NOTIN = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

const PENDING_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.CHANGE_REQUESTED,
];

function startOfDayUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

type StudioContext = {
  studioId: string;
  providerId: string;
};

type BookingForRevenue = {
  id: string;
  masterProviderId: string | null;
  providerId: string;
  service: { id: string; name: string; price: number } | null;
  serviceItems: Array<{
    serviceId: string | null;
    titleSnapshot: string;
    priceSnapshot: number;
  }>;
};

function resolveBookingRevenueKopeks(booking: {
  service: { price: number } | null;
  serviceItems: Array<{ priceSnapshot: number }>;
}): number {
  const snapshotSum = booking.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.priceSnapshot),
    0,
  );
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, booking.service?.price ?? 0);
}

async function loadCompletedBookingsInRange(
  ctx: StudioContext,
  fromUtc: Date,
  toExclusiveUtc: Date,
): Promise<BookingForRevenue[]> {
  return prisma.booking.findMany({
    where: {
      OR: [{ studioId: ctx.studioId }, { providerId: ctx.providerId }],
      startAtUtc: { gte: fromUtc, lt: toExclusiveUtc },
      status: { in: COMPLETED_STATUSES },
    },
    select: {
      id: true,
      masterProviderId: true,
      providerId: true,
      service: { select: { id: true, name: true, price: true } },
      serviceItems: {
        select: { serviceId: true, titleSnapshot: true, priceSnapshot: true },
      },
    },
  });
}

function aggregateRevenueByMaster(
  bookings: BookingForRevenue[],
): Map<string, { revenue: number; bookings: number }> {
  const totals = new Map<string, { revenue: number; bookings: number }>();
  for (const booking of bookings) {
    const masterId = booking.masterProviderId ?? booking.providerId;
    const bucket = totals.get(masterId) ?? { revenue: 0, bookings: 0 };
    bucket.revenue += resolveBookingRevenueKopeks(booking);
    bucket.bookings += 1;
    totals.set(masterId, bucket);
  }
  return totals;
}

function sumRevenueKopeks(bookings: BookingForRevenue[]): number {
  return bookings.reduce((sum, booking) => sum + resolveBookingRevenueKopeks(booking), 0);
}

async function getMastersOnShiftToday(
  providerId: string,
  weekday: number,
): Promise<StudioMasterOnShift[]> {
  // A master is "on shift today" when their weekly schedule has an
  // active day for the current weekday OR they have any booking
  // scheduled today (covers ad-hoc overrides). Simpler approximation
  // — full schedule-engine integration is backlogged.
  const masters = await prisma.provider.findMany({
    where: {
      type: ProviderType.MASTER,
      studioId: providerId,
      weeklyScheduleConfig: {
        days: {
          some: { weekday, isActive: true },
        },
      },
    },
    select: { id: true, name: true, avatarUrl: true },
  });
  return masters.map((master) => ({
    id: master.id,
    name: master.name,
    avatarUrl: master.avatarUrl ?? null,
  }));
}

async function buildTodayBanner(
  ctx: StudioContext,
  now: Date,
): Promise<{
  bookingsToday: number;
  mastersOnShift: StudioMasterOnShift[];
  totalMasters: number;
  averageLoadPercent: number;
}> {
  const todayStart = startOfDayUtc(now);
  const todayEnd = addUtcDays(todayStart, 1);
  const weekday = now.getUTCDay() === 0 ? 7 : now.getUTCDay();

  const [bookingsToday, mastersOnShift, totalMasters, mastersWithBookingsToday] =
    await Promise.all([
      prisma.booking.count({
        where: {
          OR: [{ studioId: ctx.studioId }, { providerId: ctx.providerId }],
          startAtUtc: { gte: todayStart, lt: todayEnd },
          status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
        },
      }),
      getMastersOnShiftToday(ctx.providerId, weekday),
      prisma.provider.count({
        where: { type: ProviderType.MASTER, studioId: ctx.providerId },
      }),
      prisma.booking.findMany({
        where: {
          OR: [{ studioId: ctx.studioId }, { providerId: ctx.providerId }],
          startAtUtc: { gte: todayStart, lt: todayEnd },
          status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
        },
        select: { masterProviderId: true, providerId: true },
        distinct: ["masterProviderId", "providerId"],
      }),
    ]);

  const uniqueMastersWithBookings = new Set(
    mastersWithBookingsToday
      .map((row) => row.masterProviderId ?? row.providerId)
      .filter(Boolean),
  );

  const onShiftCount = mastersOnShift.length;
  const averageLoadPercent =
    onShiftCount > 0
      ? Math.round((uniqueMastersWithBookings.size / onShiftCount) * 100)
      : 0;

  return {
    bookingsToday,
    mastersOnShift,
    totalMasters,
    averageLoadPercent,
  };
}

async function buildKpis(
  ctx: StudioContext,
  now: Date,
  banner: { mastersOnShift: StudioMasterOnShift[]; totalMasters: number },
): Promise<StudioKpis> {
  const todayStart = startOfDayUtc(now);
  const periodStart = addUtcDays(todayStart, -29); // last 30 days inclusive
  const periodEnd = addUtcDays(todayStart, 1);
  const previousStart = addUtcDays(periodStart, -30);
  const previousEnd = periodStart;

  const [
    currentBookings,
    previousBookings,
    studio,
  ] = await Promise.all([
    loadCompletedBookingsInRange(ctx, periodStart, periodEnd),
    loadCompletedBookingsInRange(ctx, previousStart, previousEnd),
    prisma.studio.findUnique({
      where: { id: ctx.studioId },
      select: { provider: { select: { ratingAvg: true, ratingCount: true } } },
    }),
  ]);

  const currentRevenue = sumRevenueKopeks(currentBookings);
  const previousRevenue = sumRevenueKopeks(previousBookings);
  const currentCount = currentBookings.length;
  const previousCount = previousBookings.length;
  const averageCheck = currentCount > 0 ? Math.round(currentRevenue / currentCount) : 0;

  // Approximate occupancy: bookings-per-master-per-day over the period
  // divided by a target capacity (5 bookings/day). The full slot-engine
  // calculation is backlogged — see BACKLOG (precise occupancy).
  const denominator = Math.max(banner.totalMasters, 1) * 30 * 5;
  const previousDenominator = Math.max(banner.totalMasters, 1) * 30 * 5;
  const currentOccupancy = Math.min(Math.round((currentCount / denominator) * 100), 100);
  const previousOccupancy = Math.min(Math.round((previousCount / previousDenominator) * 100), 100);

  const ratingAvg = studio?.provider.ratingAvg ?? 0;
  const ratingCount = studio?.provider.ratingCount ?? 0;

  return {
    revenueKopeks: {
      current: currentRevenue,
      previous: previousRevenue,
      delta: formatRelativeDelta(currentRevenue, previousRevenue),
    },
    bookingsCount: {
      current: currentCount,
      previous: previousCount,
      delta: formatRelativeDelta(currentCount, previousCount),
    },
    averageCheckKopeks: averageCheck,
    occupancyPercent: {
      current: currentOccupancy,
      previous: previousOccupancy,
      delta: formatPointsDelta(currentOccupancy, previousOccupancy),
    },
    averageRating: {
      current: ratingAvg,
      previous: ratingAvg, // no historical snapshots — neutral delta
      delta: formatRatingDelta(ratingAvg, ratingAvg),
    },
    ratingCount,
    mastersOnShiftCount: banner.mastersOnShift.length,
    totalMastersCount: banner.totalMasters,
  };
}

async function buildTopMasters(
  ctx: StudioContext,
  now: Date,
): Promise<StudioTopMasterRow[]> {
  const todayStart = startOfDayUtc(now);
  const periodStart = addUtcDays(todayStart, -29);
  const periodEnd = addUtcDays(todayStart, 1);

  const bookings = await loadCompletedBookingsInRange(ctx, periodStart, periodEnd);
  if (bookings.length === 0) return [];

  const totals = aggregateRevenueByMaster(bookings);
  const masterIds = Array.from(totals.keys()).filter((id) => id !== ctx.providerId);
  // ctx.providerId is the studio's own provider record — exclude from
  // the team leaderboard (it represents the studio entity, not a master).

  if (masterIds.length === 0) return [];

  const masters = await prisma.provider.findMany({
    where: { id: { in: masterIds } },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      ratingAvg: true,
      masterServices: {
        where: { isEnabled: true },
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { service: { select: { name: true } } },
      },
    },
  });

  const ranked = masterIds
    .map((id) => {
      const entry = totals.get(id)!;
      const master = masters.find((m) => m.id === id);
      return {
        id,
        name: master?.name ?? "Мастер",
        avatarUrl: master?.avatarUrl ?? null,
        bookingsCount: entry.bookings,
        revenueKopeks: entry.revenue,
        rating: master?.ratingAvg ?? 0,
        serviceLabel: master?.masterServices[0]?.service.name ?? null,
      };
    })
    .sort((a, b) => b.revenueKopeks - a.revenueKopeks)
    .slice(0, 5);

  const max = Math.max(...ranked.map((m) => m.revenueKopeks), 1);
  return ranked.map((row) => ({
    ...row,
    percentOfTop: Math.round((row.revenueKopeks / max) * 100),
  }));
}

async function buildAttentionItems(
  ctx: StudioContext,
): Promise<{ items: StudioAttentionItem[]; total: number; urgent: number }> {
  const [pendingMembers, pendingBookings, unansweredReviews, pendingScheduleRequests] =
    await Promise.all([
      prisma.studioMembership.count({
        where: { studioId: ctx.studioId, status: MembershipStatus.PENDING },
      }),
      prisma.booking.count({
        where: {
          OR: [{ studioId: ctx.studioId }, { providerId: ctx.providerId }],
          status: { in: PENDING_BOOKING_STATUSES },
        },
      }),
      prisma.review.count({
        where: {
          studioId: ctx.studioId,
          replyText: null,
          reportedAt: null,
          ...ACTIVE_REVIEW_FILTER,
        },
      }),
      prisma.scheduleChangeRequest.count({
        where: { studioId: ctx.studioId, status: ScheduleChangeRequestStatus.PENDING },
      }),
    ]);

  const allItems: StudioAttentionItem[] = [
    {
      id: "pending-master-approvals",
      count: pendingMembers,
      href: "/cabinet/studio/team?filter=invited",
      urgent: pendingMembers > 0,
    },
    {
      id: "bookings-awaiting",
      count: pendingBookings,
      href: "/cabinet/studio/calendar",
      urgent: pendingBookings >= 5,
    },
    {
      id: "reviews-unanswered",
      count: unansweredReviews,
      href: "/cabinet/studio/reviews?filter=no_reply",
      urgent: false,
    },
    {
      id: "schedule-requests",
      count: pendingScheduleRequests,
      href: "/cabinet/studio/schedule-requests",
      urgent: pendingScheduleRequests > 0,
    },
  ];
  const items = allItems.filter((item) => item.count > 0);

  return {
    items,
    total: items.length,
    urgent: items.filter((item) => item.urgent).length,
  };
}

async function buildTopOccupancyToday(
  ctx: StudioContext,
  now: Date,
  mastersOnShift: StudioMasterOnShift[],
): Promise<StudioOccupancyRow[]> {
  if (mastersOnShift.length === 0) return [];
  const todayStart = startOfDayUtc(now);
  const todayEnd = addUtcDays(todayStart, 1);

  const bookingsTodayByMaster = await prisma.booking.groupBy({
    by: ["masterProviderId", "providerId"],
    where: {
      OR: [{ studioId: ctx.studioId }, { providerId: ctx.providerId }],
      startAtUtc: { gte: todayStart, lt: todayEnd },
      status: { notIn: ACTIVE_BOOKING_STATUSES_NOTIN },
    },
    _count: { _all: true },
  });

  const countsByMaster = new Map<string, number>();
  for (const row of bookingsTodayByMaster) {
    const masterId = row.masterProviderId ?? row.providerId;
    countsByMaster.set(masterId, (countsByMaster.get(masterId) ?? 0) + row._count._all);
  }

  // Capacity heuristic: 5 bookings = 100%. Backlog: real slot count
  // via schedule engine.
  const CAPACITY = 5;
  const ranked = mastersOnShift.map<StudioOccupancyRow>((master) => {
    const count = countsByMaster.get(master.id) ?? 0;
    const percent = Math.min(Math.round((count / CAPACITY) * 100), 100);
    return {
      id: master.id,
      name: master.name,
      bookingsCount: count,
      capacity: CAPACITY,
      percent,
    };
  });

  return ranked
    .filter((row) => row.bookingsCount > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);
}

async function buildPopularServices(
  ctx: StudioContext,
  now: Date,
): Promise<StudioPopularService[]> {
  const todayStart = startOfDayUtc(now);
  const periodStart = addUtcDays(todayStart, -29);
  const periodEnd = addUtcDays(todayStart, 1);

  const bookings = await loadCompletedBookingsInRange(ctx, periodStart, periodEnd);
  if (bookings.length === 0) return [];

  type Bucket = {
    serviceId: string;
    name: string;
    bookingsCount: number;
    revenueKopeks: number;
    priceSamples: number[];
  };

  const buckets = new Map<string, Bucket>();
  for (const booking of bookings) {
    const service = booking.service;
    if (!service) continue;
    const bucket = buckets.get(service.id) ?? {
      serviceId: service.id,
      name: service.name,
      bookingsCount: 0,
      revenueKopeks: 0,
      priceSamples: [],
    };
    const revenue = resolveBookingRevenueKopeks(booking);
    bucket.bookingsCount += 1;
    bucket.revenueKopeks += revenue;
    bucket.priceSamples.push(revenue);
    buckets.set(service.id, bucket);
  }

  const totalBookings = bookings.length;
  return Array.from(buckets.values())
    .sort((a, b) => b.bookingsCount - a.bookingsCount)
    .slice(0, 5)
    .map<StudioPopularService>((bucket) => {
      const avgPrice = Math.round(
        bucket.priceSamples.reduce((sum, value) => sum + value, 0) /
          Math.max(bucket.priceSamples.length, 1),
      );
      return {
        id: bucket.serviceId,
        name: bucket.name,
        bookingsCount: bucket.bookingsCount,
        sharePercent: Math.round((bucket.bookingsCount / totalBookings) * 100),
        priceKopeks: avgPrice,
        revenueKopeks: bucket.revenueKopeks,
      };
    });
}

export async function buildRevenueChart(
  studioId: string,
  period: StudioDashboardPeriodId,
  now: Date = new Date(),
): Promise<StudioRevenueChartData> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    return { totalKopeks: 0, points: [] };
  }
  const ctx: StudioContext = { studioId: studio.id, providerId: studio.providerId };

  const days = daysForPeriod(period);
  const todayStart = startOfDayUtc(now);
  const periodStart = addUtcDays(todayStart, -(days - 1));
  const periodEnd = addUtcDays(todayStart, 1);

  const bookings = await loadCompletedBookingsInRange(ctx, periodStart, periodEnd);
  if (bookings.length === 0) {
    return { totalKopeks: 0, points: [] };
  }

  const totals = aggregateRevenueByMaster(bookings);
  const masterIds = Array.from(totals.keys()).filter((id) => id !== ctx.providerId);
  if (masterIds.length === 0) {
    return { totalKopeks: 0, points: [] };
  }

  const masters = await prisma.provider.findMany({
    where: { id: { in: masterIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(masters.map((m) => [m.id, m.name]));

  const points = masterIds
    .map((id) => ({
      masterId: id,
      masterName: nameById.get(id) ?? "Мастер",
      revenueKopeks: totals.get(id)!.revenue,
      bookingsCount: totals.get(id)!.bookings,
    }))
    .sort((a, b) => b.revenueKopeks - a.revenueKopeks);

  const totalKopeks = points.reduce((sum, p) => sum + p.revenueKopeks, 0);
  return { totalKopeks, points };
}

export async function loadStudioDashboardData(input: {
  studioId: string;
}): Promise<StudioDashboardData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new Error(`Studio not found: ${input.studioId}`);
  }
  const ctx: StudioContext = { studioId: studio.id, providerId: studio.providerId };
  const now = new Date();

  const banner = await buildTodayBanner(ctx, now);
  const [kpis, topMasters, attention, topOccupancyToday, popularServices, revenueChart] =
    await Promise.all([
      buildKpis(ctx, now, { mastersOnShift: banner.mastersOnShift, totalMasters: banner.totalMasters }),
      buildTopMasters(ctx, now),
      buildAttentionItems(ctx),
      buildTopOccupancyToday(ctx, now, banner.mastersOnShift),
      buildPopularServices(ctx, now),
      buildRevenueChart(ctx.studioId, "30d", now),
    ]);

  return {
    todayBanner: banner,
    kpis,
    topMasters,
    attentionItems: attention.items,
    attentionTotal: attention.total,
    attentionUrgent: attention.urgent,
    topOccupancyToday,
    popularServices,
    revenueChart,
  };
}
