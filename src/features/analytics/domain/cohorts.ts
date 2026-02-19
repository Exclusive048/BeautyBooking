import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";

type CohortRow = {
  cohortMonth: string;
  month: string;
  value: number;
};

type CohortSeries = {
  cohort: string;
  size: number;
  values: number[];
};

type CohortSummary = {
  avgM1: number;
  avgM3: number;
  bestM1Cohort: string | null;
};

type CohortResult = {
  monthsBack: number;
  cohorts: CohortSeries[];
  summary: CohortSummary;
};

function getLocalMonthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}`;
}

function monthIndex(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return year * 12 + month;
}

function shiftMonthKey(monthKey: string, diff: number): string {
  const index = monthIndex(monthKey) - 1 + diff;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildScopeFilters(context: AnalyticsContext): Prisma.Sql {
  const filters: Prisma.Sql[] = [];
  if (context.scope === "MASTER") {
    filters.push(
      Prisma.sql`(b."masterProviderId" = ${context.providerId} OR (b."masterProviderId" IS NULL AND b."providerId" = ${context.providerId}))`
    );
  } else {
    filters.push(
      Prisma.sql`(b."studioId" = ${context.studioId} OR b."providerId" = ${context.providerId})`
    );
    if (context.masterFilterId) {
      filters.push(Prisma.sql`b."masterProviderId" = ${context.masterFilterId}`);
    }
  }
  return Prisma.join(filters, " AND ");
}

function buildCohortSeries(rows: CohortRow[], monthsBack: number): CohortResult {
  const cohortsMap = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const cohort = cohortsMap.get(row.cohortMonth) ?? new Map<string, number>();
    cohort.set(row.month, row.value);
    cohortsMap.set(row.cohortMonth, cohort);
  }

  const cohorts: CohortSeries[] = [];
  const m1Values: number[] = [];
  const m3Values: number[] = [];

  const cohortKeys = Array.from(cohortsMap.keys()).sort();
  for (const cohortKey of cohortKeys) {
    const valuesByMonth = cohortsMap.get(cohortKey)!;
    const size = valuesByMonth.get(cohortKey) ?? 0;
    const values: number[] = [];
    for (let offset = 0; offset < monthsBack; offset += 1) {
      const month = shiftMonthKey(cohortKey, offset);
      const value = valuesByMonth.get(month) ?? 0;
      values.push(size > 0 ? value / size : 0);
    }
    cohorts.push({ cohort: cohortKey, size, values });
    if (values.length > 1) m1Values.push(values[1]);
    if (values.length > 3) m3Values.push(values[3]);
  }

  const avg = (list: number[]) =>
    list.length > 0 ? Number((list.reduce((sum, v) => sum + v, 0) / list.length).toFixed(3)) : 0;

  const best = cohorts.reduce<{ cohort: string | null; value: number }>(
    (acc, item) => {
      const value = item.values[1] ?? 0;
      if (value > acc.value) return { cohort: item.cohort, value };
      return acc;
    },
    { cohort: null, value: 0 }
  );

  return {
    monthsBack,
    cohorts,
    summary: {
      avgM1: avg(m1Values),
      avgM3: avg(m3Values),
      bestM1Cohort: best.cohort,
    },
  };
}

export async function getRetentionCohorts(input: {
  context: AnalyticsContext;
  monthsBack: number;
}): Promise<CohortResult> {
  const monthsBack = Math.max(1, Math.min(12, input.monthsBack));
  const now = new Date();
  const currentMonth = getLocalMonthKey(now, input.context.timeZone);
  const fromMonth = shiftMonthKey(currentMonth, -(monthsBack - 1));
  const fromUtc = new Date(`${fromMonth}-01T00:00:00.000Z`);
  const toUtcExclusive = new Date(now.getTime());

  const rows = await prisma.$queryRaw<
    Array<{ cohort_month: Date; month: Date; clients: bigint }>
  >`
    WITH completed AS (
      SELECT
        b."clientUserId" AS client_id,
        date_trunc('month', (b."startAtUtc" AT TIME ZONE 'UTC' AT TIME ZONE ${input.context.timeZone}))::date AS local_month
      FROM "Booking" b
      WHERE ${buildScopeFilters(input.context)}
        AND b."clientUserId" IS NOT NULL
        AND b."startAtUtc" IS NOT NULL
        AND b."startAtUtc" >= ${fromUtc}
        AND b."startAtUtc" < ${toUtcExclusive}
        AND (b."status" = 'FINISHED' OR (b."status" IN ('CONFIRMED','PREPAID','STARTED','IN_PROGRESS') AND b."endAtUtc" < NOW()))
    ),
    first_visit AS (
      SELECT client_id, MIN(local_month) AS cohort_month
      FROM completed
      GROUP BY client_id
    ),
    activity AS (
      SELECT f.cohort_month, c.local_month, c.client_id
      FROM completed c
      JOIN first_visit f ON f.client_id = c.client_id
    )
    SELECT cohort_month, local_month AS month, COUNT(DISTINCT client_id)::bigint AS clients
    FROM activity
    GROUP BY cohort_month, local_month
    ORDER BY cohort_month, local_month
  `;

  const mapped: CohortRow[] = rows.map((row) => ({
    cohortMonth: row.cohort_month.toISOString().slice(0, 7),
    month: row.month.toISOString().slice(0, 7),
    value: Number(row.clients),
  }));

  return buildCohortSeries(mapped, monthsBack);
}

export async function getRevenueCohorts(input: {
  context: AnalyticsContext;
  monthsBack: number;
}): Promise<CohortResult> {
  const monthsBack = Math.max(1, Math.min(12, input.monthsBack));
  const now = new Date();
  const currentMonth = getLocalMonthKey(now, input.context.timeZone);
  const fromMonth = shiftMonthKey(currentMonth, -(monthsBack - 1));
  const fromUtc = new Date(`${fromMonth}-01T00:00:00.000Z`);
  const toUtcExclusive = new Date(now.getTime());

  const rows = await prisma.$queryRaw<
    Array<{ cohort_month: Date; month: Date; revenue: bigint }>
  >`
    WITH booking_revenue AS (
      SELECT
        b.id AS booking_id,
        b."clientUserId" AS client_id,
        date_trunc('month', (b."startAtUtc" AT TIME ZONE 'UTC' AT TIME ZONE ${input.context.timeZone}))::date AS local_month,
        SUM(i."priceSnapshot")::bigint AS revenue
      FROM "Booking" b
      JOIN "BookingServiceItem" i ON i."bookingId" = b.id
      WHERE ${buildScopeFilters(input.context)}
        AND b."clientUserId" IS NOT NULL
        AND b."startAtUtc" IS NOT NULL
        AND b."startAtUtc" >= ${fromUtc}
        AND b."startAtUtc" < ${toUtcExclusive}
        AND (b."status" = 'FINISHED' OR (b."status" IN ('CONFIRMED','PREPAID','STARTED','IN_PROGRESS') AND b."endAtUtc" < NOW()))
      GROUP BY b.id, b."clientUserId", local_month
    ),
    first_visit AS (
      SELECT client_id, MIN(local_month) AS cohort_month
      FROM booking_revenue
      GROUP BY client_id
    ),
    activity AS (
      SELECT f.cohort_month, r.local_month, r.revenue, r.client_id
      FROM booking_revenue r
      JOIN first_visit f ON f.client_id = r.client_id
    )
    SELECT cohort_month, local_month AS month, SUM(revenue)::bigint AS revenue
    FROM activity
    GROUP BY cohort_month, local_month
    ORDER BY cohort_month, local_month
  `;

  const mapped: CohortRow[] = rows.map((row) => ({
    cohortMonth: row.cohort_month.toISOString().slice(0, 7),
    month: row.month.toISOString().slice(0, 7),
    value: Number(row.revenue),
  }));

  return buildCohortSeries(mapped, monthsBack);
}
