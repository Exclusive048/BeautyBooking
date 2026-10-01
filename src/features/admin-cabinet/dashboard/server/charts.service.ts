import "server-only";

import { prisma } from "@/lib/prisma";
import * as UI_TEXT from "@/lib/ui/text";
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
import { UI_FMT } from "@/lib/ui/fmt";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets `createdAt` rows into 7 UTC day-keys (today + previous 6).
 * Returns ordered `[oldest → today]`. Days with no rows are zero. */
function bucketBy7Days(
  rows: { createdAt: Date }[],
  start: Date,
): AdminChartPoint[] {
  // LOGIC-28: tz-источник — **UTC-tech**, и он обязан совпадать с тем, по чему
  // строятся сами бакеты. Ключ точки — `utcDateKey` (строго UTC, `shared.ts`),
  // а подпись рендерилась в ambient-tz процесса: один и тот же `date`
  // бакетировался по UTC и подписывался по `TZ` контейнера. При RU-хостинге
  // (положительное смещение) UTC-полночь попадает в тот же календарный день,
  // поэтому расхождения сегодня нет — но выбор не был объявлен и внутренне
  // противоречив: площадка с отрицательным смещением сдвинула бы подписи на
  // день относительно СОБСТВЕННЫХ бакетов, молча. Это админская техническая
  // сводка, а не время записи, поэтому UTC здесь и есть правильный источник —
  // не salon-tz.
  // tz-ok: UTC-tech — подпись обязана совпасть с UTC-бакетом.
  const label = (date: Date, preset: "dayMonthShort" | "dayOfMonth") =>
    UI_FMT.date(date, preset, { timeZone: "UTC" });

  const points: AdminChartPoint[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start.getTime() + i * DAY_MS);
    points.push({
      date: utcDateKey(date),
      label:
        i === 0
          ? label(date, "dayMonthShort") // oldest day gets a "DD month" label
          : i === 6
            ? UI_TEXT.adminPanel.dashboard.charts.todayLabel
            : label(date, "dayOfMonth"), // mid-days get just the day number
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
