import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { addDaysToDateKey, diffDateKeys } from "@/lib/schedule/dateKey";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";
import type { AnalyticsRange } from "@/features/analytics/domain/date-range";
import { buildCreatedAtRange, buildScopeWhere } from "@/features/analytics/domain/helpers";
import { STATUS_CANCELLED, STATUS_CONFIRMED, STATUS_NO_SHOW } from "@/features/analytics/domain/status-map";

type FunnelResult = {
  created: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  confirmedRate: number;
  completedRate: number;
  cancelRate: number;
  noShowRate: number;
};

type HeatmapCell = {
  day: number;
  hour: number;
  count: number;
};

type HeatmapResult = {
  cells: HeatmapCell[];
};

type LeadTimeBucket = {
  key: string;
  label: string;
  count: number;
};

type LeadTimeResult = {
  buckets: LeadTimeBucket[];
};

export async function getBookingsFunnel(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
}): Promise<FunnelResult> {
  const rows = await prisma.booking.groupBy({
    by: ["status"],
    where: {
      AND: [buildScopeWhere(input.context), buildCreatedAtRange(input.range)],
    },
    _count: { _all: true },
  });

  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  const confirmed = rows
    .filter((row) => STATUS_CONFIRMED.includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);
  const completed = rows
    .filter((row) => row.status === "FINISHED")
    .reduce((sum, row) => sum + row._count._all, 0);
  const cancelled = rows
    .filter((row) => STATUS_CANCELLED.includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);
  const noShow = rows
    .filter((row) => STATUS_NO_SHOW.includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);

  return {
    created: total,
    confirmed,
    completed,
    cancelled,
    noShow,
    confirmedRate: total > 0 ? confirmed / total : 0,
    completedRate: total > 0 ? completed / total : 0,
    cancelRate: total > 0 ? cancelled / total : 0,
    noShowRate: total > 0 ? noShow / total : 0,
  };
}

export async function getBookingsHeatmap(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
}): Promise<HeatmapResult> {
  const scopeFilters: Prisma.Sql[] = [];

  if (input.context.scope === "MASTER") {
    scopeFilters.push(
      Prisma.sql`(b."masterProviderId" = ${input.context.providerId} OR (b."masterProviderId" IS NULL AND b."providerId" = ${input.context.providerId}))`
    );
  } else {
    scopeFilters.push(
      Prisma.sql`(b."studioId" = ${input.context.studioId} OR b."providerId" = ${input.context.providerId})`
    );
    if (input.context.masterFilterId) {
      scopeFilters.push(Prisma.sql`b."masterProviderId" = ${input.context.masterFilterId}`);
    }
  }

  const STATUS_HEATMAP = ["CONFIRMED", "PREPAID", "STARTED", "IN_PROGRESS", "FINISHED"] as const;

  const rows = await prisma.$queryRaw<Array<{ day: number; hour: number; count: bigint }>>`
    SELECT
      EXTRACT(DOW FROM (b."startAtUtc" AT TIME ZONE 'UTC' AT TIME ZONE ${input.context.timeZone}))::int AS day,
      EXTRACT(HOUR FROM (b."startAtUtc" AT TIME ZONE 'UTC' AT TIME ZONE ${input.context.timeZone}))::int AS hour,
      COUNT(*)::bigint AS count
    FROM "Booking" b
    WHERE ${Prisma.join(scopeFilters, " AND ")}
      AND b."startAtUtc" IS NOT NULL
      AND b."startAtUtc" >= ${input.range.fromUtc}
      AND b."startAtUtc" < ${input.range.toUtcExclusive}
      AND (b."status"::text) IN (${Prisma.join(STATUS_HEATMAP)})
    GROUP BY 1, 2
  `;

  return {
    cells: rows.map((row) => ({
      day: row.day,
      hour: row.hour,
      count: Number(row.count),
    })),
  };
}


export async function getBookingsLeadTime(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
}): Promise<LeadTimeResult> {
  const bookings = await prisma.booking.findMany({
    where: {
      AND: [buildScopeWhere(input.context), buildCreatedAtRange(input.range)],
      startAtUtc: { not: null },
    },
    select: {
      createdAt: true,
      startAtUtc: true,
    },
  });

  const buckets: Record<string, LeadTimeBucket> = {
    same_day: { key: "same_day", label: "В тот же день", count: 0 },
    one_day: { key: "one_day", label: "1 день", count: 0 },
    two_three: { key: "two_three", label: "2–3 дня", count: 0 },
    four_seven: { key: "four_seven", label: "4–7 дней", count: 0 },
    one_two_weeks: { key: "one_two_weeks", label: "1–2 недели", count: 0 },
    two_plus: { key: "two_plus", label: "2+ недели", count: 0 },
  };

  for (const booking of bookings) {
    if (!booking.startAtUtc) continue;
    const createdKey = toLocalDateKey(booking.createdAt, input.context.timeZone);
    const startKey = toLocalDateKey(booking.startAtUtc, input.context.timeZone);
    const diff = diffDateKeys(createdKey, addDaysToDateKey(startKey, 1));
    if (diff <= 0) buckets.same_day.count += 1;
    else if (diff === 1) buckets.one_day.count += 1;
    else if (diff <= 3) buckets.two_three.count += 1;
    else if (diff <= 7) buckets.four_seven.count += 1;
    else if (diff <= 14) buckets.one_two_weeks.count += 1;
    else buckets.two_plus.count += 1;
  }

  return { buckets: Object.values(buckets) };
}
