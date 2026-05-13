import "server-only";

import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";
import {
  computePercentDelta,
  utcDateKey,
  utcLastNDays,
} from "@/features/admin-cabinet/dashboard/server/shared";
import type {
  AdminCharts,
  AdminChartPoint,
  AdminChartSeries,
} from "@/features/admin-cabinet/dashboard/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets `createdAt` rows into 7 UTC day-keys (today + previous 6).
 * Returns ordered `[oldest → today]`. Days with no rows are zero. */
function bucketBy7Days(
  rows: { createdAt: Date }[],
  start: Date,
): AdminChartPoint[] {
  const labelFmt = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
  });
  const dayLabel = new Intl.DateTimeFormat("ru-RU", { day: "2-digit" });

  const points: AdminChartPoint[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start.getTime() + i * DAY_MS);
    points.push({
      date: utcDateKey(date),
      label:
        i === 0
          ? labelFmt.format(date) // oldest day gets a "DD month" label
          : i === 6
            ? UI_TEXT.adminPanel.dashboard.charts.todayLabel
            : dayLabel.format(date), // mid-days get just the day number
      count: 0,
    });
  }

  const byKey = new Map(points.map((p) => [p.date, p] as const));
  for (const row of rows) {
    const key = utcDateKey(row.createdAt);
    const point = byKey.get(key);
    if (point) point.count += 1;
  }

  return points;
}

function buildSeries(
  points: AdminChartPoint[],
  prevWeekTotal: number,
): AdminChartSeries {
  const total = points.reduce((acc, p) => acc + p.count, 0);
  const delta = computePercentDelta(total, prevWeekTotal);
  return {
    total,
    deltaText: delta.text,
    deltaSign: delta.sign,
    points,
  };
}

export async function getAdminCharts(): Promise<AdminCharts> {
  const last7 = utcLastNDays(7);
  const prev7 = {
    start: new Date(last7.start.getTime() - 7 * DAY_MS),
    end: last7.start,
  };

  const [regRows, bookingRows, regPrev7Total, bookingsPrev7Total] =
    await Promise.all([
      prisma.userProfile.findMany({
        where: { createdAt: { gte: last7.start, lt: last7.end } },
        select: { createdAt: true },
      }),
      prisma.booking.findMany({
        where: { createdAt: { gte: last7.start, lt: last7.end } },
        select: { createdAt: true },
      }),
      prisma.userProfile.count({
        where: { createdAt: { gte: prev7.start, lt: prev7.end } },
      }),
      prisma.booking.count({
        where: { createdAt: { gte: prev7.start, lt: prev7.end } },
      }),
    ]);

  const registrations = buildSeries(
    bucketBy7Days(regRows, last7.start),
    regPrev7Total,
  );
  const bookings = buildSeries(
    bucketBy7Days(bookingRows, last7.start),
    bookingsPrev7Total,
  );

  return { registrations, bookings };
}
