import { prisma } from "@/lib/prisma";
import { BookingStatus } from "@prisma/client";
import { toKopeks, type Kopeks } from "@/lib/money/kopeks";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";
import type { AnalyticsRange } from "@/features/analytics/domain/date-range";
import {
  buildScopeWhere,
  buildStartAtRange,
  getBucketKey,
  listBucketKeys,
  type TimelineGranularity,
} from "@/features/analytics/domain/helpers";
import { buildCompletedWhere } from "@/features/analytics/domain/status-map";

type TimelinePoint = {
  date: string;
  revenue: number;
  bookings: number;
  clients: number;
  avgCheck: number;
};

type RevenueTimeline = {
  granularity: TimelineGranularity;
  points: TimelinePoint[];
};

type RevenueSlice = {
  key: string;
  label: string;
  revenue: number;
  bookings: number;
  share: number;
};

type RevenueByService = {
  totalRevenue: number;
  rows: RevenueSlice[];
};

type RevenueByMasterRow = {
  masterId: string;
  masterName: string;
  revenue: number;
  bookings: number;
  share: number;
};

type RevenueByMaster = {
  totalRevenue: number;
  rows: RevenueByMasterRow[];
};

type ForecastResult = {
  month: string;
  plannedRevenue: number;
  historicalCancelRate: number;
  forecastRevenue: number;
};

/**
 * Booking → revenue map, mirroring the dashboard's `sumBookingPrice`
 * (`day.service.ts`, R2-03-B): the sum of positive `BookingServiceItem`
 * snapshots when present, else a fallback to `Service.price`. Never both —
 * item present (snap > 0) → snapshot; item absent → service price.
 *
 * Production `createBooking` always writes a priced item in-tx, so the
 * fallback only affects item-less / imported rows; adding it keeps analytics
 * consistent with the dashboard on the same data (the R2-03 reconciliation).
 */
async function loadBookingRevenueMap(
  bookings: Array<{ id: string; servicePrice: Kopeks }>,
): Promise<Map<string, Kopeks>> {
  if (bookings.length === 0) return new Map();
  const grouped = await prisma.bookingServiceItem.groupBy({
    by: ["bookingId"],
    where: { bookingId: { in: bookings.map((booking) => booking.id) } },
    _sum: { priceSnapshot: true },
  });
  const snapshotSum = new Map<string, number>();
  for (const row of grouped) {
    snapshotSum.set(row.bookingId, Math.max(0, row._sum?.priceSnapshot ?? 0));
  }
  const map = new Map<string, Kopeks>();
  for (const booking of bookings) {
    const snap = snapshotSum.get(booking.id) ?? 0;
    // Re-brand once at the map insert (fallback/arithmetic widened to `number`).
    map.set(booking.id, toKopeks(snap > 0 ? snap : Math.max(0, booking.servicePrice)));
  }
  return map;
}

export async function getRevenueTimeline(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
  granularity: TimelineGranularity;
}): Promise<RevenueTimeline> {
  const where = {
    AND: [buildScopeWhere(input.context), buildStartAtRange(input.range), buildCompletedWhere(new Date())],
  };

  const bookings = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      startAtUtc: true,
      clientUserId: true,
      service: { select: { price: true } },
    },
  });

  const revenueMap = await loadBookingRevenueMap(
    bookings.map((item) => ({ id: item.id, servicePrice: toKopeks(item.service?.price ?? 0) })),
  );
  const bucketKeys = listBucketKeys(input.range, input.context.timeZone, input.granularity);
  const buckets = new Map<string, { revenue: number; bookings: number; clients: Set<string> }>();
  bucketKeys.forEach((key) => buckets.set(key, { revenue: 0, bookings: 0, clients: new Set() }));

  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const key = getBucketKey(booking.startAtUtc, input.context.timeZone, input.granularity);
    const bucket = buckets.get(key) ?? { revenue: 0, bookings: 0, clients: new Set() };
    const revenue = revenueMap.get(booking.id) ?? 0;
    bucket.revenue += revenue;
    bucket.bookings += 1;
    if (booking.clientUserId) {
      bucket.clients.add(booking.clientUserId);
    }
    buckets.set(key, bucket);
  }

  const points: TimelinePoint[] = bucketKeys.map((key) => {
    const bucket = buckets.get(key) ?? { revenue: 0, bookings: 0, clients: new Set() };
    return {
      date: key,
      revenue: bucket.revenue,
      bookings: bucket.bookings,
      clients: bucket.clients.size,
      avgCheck: bucket.bookings > 0 ? Math.round(bucket.revenue / bucket.bookings) : 0,
    };
  });

  return { granularity: input.granularity, points };
}

export async function getRevenueByService(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
}): Promise<RevenueByService> {
  const rows = await prisma.bookingServiceItem.groupBy({
    by: ["titleSnapshot"],
    where: {
      titleSnapshot: { not: "" },
      booking: {
        AND: [buildScopeWhere(input.context), buildStartAtRange(input.range), buildCompletedWhere(new Date())],
      },
    },
    _sum: { priceSnapshot: true },
    _count: { _all: true },
  });

  const totalRevenue = rows.reduce((sum, row) => sum + Math.max(0, row._sum?.priceSnapshot ?? 0), 0);
  const mapped = rows
    .map((row) => {
      const revenue = Math.max(0, row._sum?.priceSnapshot ?? 0);
      const bookings = typeof row._count === "number" ? row._count : row._count?._all ?? 0;
      return {
        key: row.titleSnapshot,
        label: row.titleSnapshot,
        revenue,
        bookings,
        share: totalRevenue > 0 ? revenue / totalRevenue : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return { totalRevenue, rows: mapped };
}

export async function getRevenueByMaster(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
}): Promise<RevenueByMaster> {
  const where = {
    AND: [buildScopeWhere(input.context), buildStartAtRange(input.range), buildCompletedWhere(new Date())],
  };

  const bookings = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      masterProviderId: true,
      providerId: true,
      service: { select: { price: true } },
    },
  });

  const revenueMap = await loadBookingRevenueMap(
    bookings.map((item) => ({ id: item.id, servicePrice: toKopeks(item.service?.price ?? 0) })),
  );

  const totals = new Map<string, { revenue: number; bookings: number }>();
  for (const booking of bookings) {
    const masterId = booking.masterProviderId ?? booking.providerId;
    const bucket = totals.get(masterId) ?? { revenue: 0, bookings: 0 };
    bucket.revenue += revenueMap.get(booking.id) ?? 0;
    bucket.bookings += 1;
    totals.set(masterId, bucket);
  }

  const masterIds = Array.from(totals.keys());
  const masters = await prisma.provider.findMany({
    where: { id: { in: masterIds } },
    select: { id: true, name: true },
  });
  const names = new Map(masters.map((master) => [master.id, master.name]));

  const totalRevenue = Array.from(totals.values()).reduce((sum, item) => sum + item.revenue, 0);

  const rows: RevenueByMasterRow[] = masterIds
    .map((id) => {
      const item = totals.get(id)!;
      return {
        masterId: id,
        masterName: names.get(id) ?? "Мастер",
        revenue: item.revenue,
        bookings: item.bookings,
        share: totalRevenue > 0 ? item.revenue / totalRevenue : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return { totalRevenue, rows };
}

export async function getRevenueForecast(input: {
  context: AnalyticsContext;
  month: string;
  range: AnalyticsRange;
}): Promise<ForecastResult> {
  const now = new Date();
  const upcomingStatuses: BookingStatus[] = [
    "CONFIRMED",
    "PREPAID",
    "STARTED",
    "IN_PROGRESS",
    "FINISHED",
  ];
  const upcomingWhere = {
    AND: [
      buildScopeWhere(input.context),
      buildStartAtRange(input.range),
      {
        status: {
          in: upcomingStatuses,
        },
      },
    ],
  };

  const upcoming = await prisma.booking.findMany({
    where: upcomingWhere,
    select: { id: true, service: { select: { price: true } } },
  });
  const revenueMap = await loadBookingRevenueMap(
    upcoming.map((item) => ({ id: item.id, servicePrice: toKopeks(item.service?.price ?? 0) })),
  );
  const plannedRevenue = Array.from(revenueMap.values()).reduce((sum, value) => sum + value, 0);

  const historyStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const history = await prisma.booking.groupBy({
    by: ["status"],
    where: {
      AND: [buildScopeWhere(input.context), { createdAt: { gte: historyStart, lt: now } }],
    },
    _count: { _all: true },
  });
  const total = history.reduce((sum, row) => sum + row._count._all, 0);
  const cancelled = history
    .filter((row) => row.status === "CANCELLED" || row.status === "REJECTED" || row.status === "NO_SHOW")
    .reduce((sum, row) => sum + row._count._all, 0);
  const cancelRate = total > 0 ? cancelled / total : 0;
  const forecastRevenue = Math.round(plannedRevenue * (1 - cancelRate));

  return {
    month: input.month,
    plannedRevenue,
    historicalCancelRate: Number(cancelRate.toFixed(3)),
    forecastRevenue,
  };
}
