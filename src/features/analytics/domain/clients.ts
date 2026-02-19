import { prisma } from "@/lib/prisma";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { addDaysToDateKey, diffDateKeys } from "@/lib/schedule/dateKey";
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

type ClientSegmentSummary = {
  new: number;
  returning: number;
  loyal: number;
  sleeping: number;
  lost: number;
};

type TopClientRow = {
  clientId: string;
  revenue: number;
  visits: number;
  lastVisit: string | null;
};

type ClientSegmentsResult = {
  segments: ClientSegmentSummary;
  topClients: TopClientRow[];
};

type LtvSummary = {
  avgRevenue: number;
  medianRevenue: number;
  avgVisits: number;
  avgLifespanDays: number;
};

type LtvResult = {
  summary: LtvSummary;
};

type NewReturningPoint = {
  date: string;
  newClients: number;
  returningClients: number;
};

type NewReturningResult = {
  granularity: TimelineGranularity;
  points: NewReturningPoint[];
};

type AtRiskClient = {
  clientId: string;
  lastVisit: string | null;
  avgIntervalDays: number;
  daysSinceLast: number;
};

type AtRiskResult = {
  thresholdDays: number;
  clients: AtRiskClient[];
};

function sumRevenue(items: Array<{ priceSnapshot: number }>): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
}

export async function getClientSegments(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
}): Promise<ClientSegmentsResult> {
  const bookings = await prisma.booking.findMany({
    where: {
      AND: [buildScopeWhere(input.context), buildStartAtRange(input.range), buildCompletedWhere(new Date())],
    },
    select: {
      clientUserId: true,
      startAtUtc: true,
      serviceItems: { select: { priceSnapshot: true } },
    },
  });

  const todayKey = toLocalDateKey(new Date(), input.context.timeZone);
  const todayExclusive = addDaysToDateKey(todayKey, 1);
  const clientStats = new Map<
    string,
    { visits: number; lastVisit: string; revenue: number }
  >();

  for (const booking of bookings) {
    if (!booking.clientUserId || !booking.startAtUtc) continue;
    const key = toLocalDateKey(booking.startAtUtc, input.context.timeZone);
    const revenue = sumRevenue(booking.serviceItems);
    const existing = clientStats.get(booking.clientUserId);
    if (!existing) {
      clientStats.set(booking.clientUserId, { visits: 1, lastVisit: key, revenue });
      continue;
    }
    existing.visits += 1;
    existing.revenue += revenue;
    if (key > existing.lastVisit) {
      existing.lastVisit = key;
    }
  }

  const segments: ClientSegmentSummary = {
    new: 0,
    returning: 0,
    loyal: 0,
    sleeping: 0,
    lost: 0,
  };

  const topClients: TopClientRow[] = [];

  for (const [clientId, stats] of clientStats.entries()) {
    const daysSinceLast = diffDateKeys(stats.lastVisit, todayExclusive);
    if (daysSinceLast > 60) {
      segments.lost += 1;
    } else if (daysSinceLast >= 30) {
      segments.sleeping += 1;
    } else if (stats.visits >= 4) {
      segments.loyal += 1;
    } else if (stats.visits >= 2) {
      segments.returning += 1;
    } else {
      segments.new += 1;
    }

    topClients.push({
      clientId,
      revenue: stats.revenue,
      visits: stats.visits,
      lastVisit: stats.lastVisit,
    });
  }

  topClients.sort((a, b) => b.revenue - a.revenue);

  return {
    segments,
    topClients: topClients.slice(0, 10),
  };
}

export async function getClientLtv(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
}): Promise<LtvResult> {
  const bookings = await prisma.booking.findMany({
    where: {
      AND: [buildScopeWhere(input.context), buildStartAtRange(input.range), buildCompletedWhere(new Date())],
    },
    select: {
      clientUserId: true,
      startAtUtc: true,
      serviceItems: { select: { priceSnapshot: true } },
    },
  });

  const clientStats = new Map<
    string,
    { visits: number; revenue: number; firstVisit: string; lastVisit: string }
  >();

  for (const booking of bookings) {
    if (!booking.clientUserId || !booking.startAtUtc) continue;
    const dateKey = toLocalDateKey(booking.startAtUtc, input.context.timeZone);
    const revenue = sumRevenue(booking.serviceItems);
    const existing = clientStats.get(booking.clientUserId);
    if (!existing) {
      clientStats.set(booking.clientUserId, {
        visits: 1,
        revenue,
        firstVisit: dateKey,
        lastVisit: dateKey,
      });
      continue;
    }
    existing.visits += 1;
    existing.revenue += revenue;
    if (dateKey < existing.firstVisit) existing.firstVisit = dateKey;
    if (dateKey > existing.lastVisit) existing.lastVisit = dateKey;
  }

  const revenues = Array.from(clientStats.values()).map((item) => item.revenue);
  revenues.sort((a, b) => a - b);

  const totalRevenue = revenues.reduce((sum, value) => sum + value, 0);
  const avgRevenue = revenues.length > 0 ? Math.round(totalRevenue / revenues.length) : 0;
  const medianRevenue =
    revenues.length === 0
      ? 0
      : revenues.length % 2 === 1
        ? revenues[Math.floor(revenues.length / 2)]
        : Math.round((revenues[revenues.length / 2 - 1] + revenues[revenues.length / 2]) / 2);

  const avgVisits =
    clientStats.size > 0
      ? Array.from(clientStats.values()).reduce((sum, item) => sum + item.visits, 0) /
        clientStats.size
      : 0;

  const avgLifespanDays =
    clientStats.size > 0
      ? Array.from(clientStats.values()).reduce((sum, item) => {
          const lifespan = diffDateKeys(item.firstVisit, addDaysToDateKey(item.lastVisit, 1));
          return sum + lifespan;
        }, 0) / clientStats.size
      : 0;

  return {
    summary: {
      avgRevenue,
      medianRevenue,
      avgVisits: Number(avgVisits.toFixed(2)),
      avgLifespanDays: Number(avgLifespanDays.toFixed(1)),
    },
  };
}

export async function getNewVsReturning(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
  granularity: TimelineGranularity;
}): Promise<NewReturningResult> {
  const bookings = await prisma.booking.findMany({
    where: {
      AND: [buildScopeWhere(input.context), buildStartAtRange(input.range), buildCompletedWhere(new Date())],
    },
    select: {
      clientUserId: true,
      startAtUtc: true,
    },
  });

  const firstVisits = new Map<string, string>();
  for (const booking of bookings) {
    if (!booking.clientUserId || !booking.startAtUtc) continue;
    const dateKey = toLocalDateKey(booking.startAtUtc, input.context.timeZone);
    const existing = firstVisits.get(booking.clientUserId);
    if (!existing || dateKey < existing) {
      firstVisits.set(booking.clientUserId, dateKey);
    }
  }

  const bucketKeys = listBucketKeys(input.range, input.context.timeZone, input.granularity);
  const buckets = new Map<string, { newClients: number; returningClients: number }>();
  bucketKeys.forEach((key) => buckets.set(key, { newClients: 0, returningClients: 0 }));

  for (const booking of bookings) {
    if (!booking.clientUserId || !booking.startAtUtc) continue;
    const bucket = getBucketKey(booking.startAtUtc, input.context.timeZone, input.granularity);
    const firstVisit = firstVisits.get(booking.clientUserId);
    const target = buckets.get(bucket);
    if (!target || !firstVisit) continue;
    if (firstVisit === toLocalDateKey(booking.startAtUtc, input.context.timeZone)) {
      target.newClients += 1;
    } else {
      target.returningClients += 1;
    }
  }

  const points = bucketKeys.map((key) => {
    const bucket = buckets.get(key) ?? { newClients: 0, returningClients: 0 };
    return { date: key, newClients: bucket.newClients, returningClients: bucket.returningClients };
  });

  return { granularity: input.granularity, points };
}

export async function getAtRiskClients(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
  thresholdDays: number;
}): Promise<AtRiskResult> {
  const rows = await prisma.booking.groupBy({
    by: ["clientUserId"],
    where: {
      clientUserId: { not: null },
      AND: [buildScopeWhere(input.context), buildStartAtRange(input.range), buildCompletedWhere(new Date())],
    },
    _count: { _all: true },
    _min: { startAtUtc: true },
    _max: { startAtUtc: true },
  });

  const todayKey = toLocalDateKey(new Date(), input.context.timeZone);
  const todayExclusive = addDaysToDateKey(todayKey, 1);
  const clients: AtRiskClient[] = [];

  for (const row of rows) {
    const count = typeof row._count === "number" ? row._count : row._count?._all ?? 0;
    const firstVisit = row._min?.startAtUtc ?? null;
    const lastVisit = row._max?.startAtUtc ?? null;
    if (!row.clientUserId || !firstVisit || !lastVisit) continue;
    if (count < 2) continue;

    const firstKey = toLocalDateKey(firstVisit, input.context.timeZone);
    const lastKey = toLocalDateKey(lastVisit, input.context.timeZone);
    const spanDays = diffDateKeys(firstKey, lastKey);
    const avgInterval = spanDays / Math.max(1, count - 1);
    const daysSinceLast = diffDateKeys(lastKey, todayExclusive);

    if (daysSinceLast > avgInterval * 1.5 && daysSinceLast >= input.thresholdDays) {
      clients.push({
        clientId: row.clientUserId,
        lastVisit: lastKey,
        avgIntervalDays: Number(avgInterval.toFixed(1)),
        daysSinceLast,
      });
    }
  }

  clients.sort((a, b) => b.daysSinceLast - a.daysSinceLast);

  return { thresholdDays: input.thresholdDays, clients };
}
