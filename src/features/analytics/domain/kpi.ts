import { BookingStatus, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDayOfWeek, toLocalDateKey } from "@/lib/schedule/timezone";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";
import type { AnalyticsRange } from "@/features/analytics/domain/date-range";
import { buildScopeWhere, buildStartAtRange } from "@/features/analytics/domain/helpers";
import { addDaysToDateKey, listDateKeysInclusive } from "@/lib/schedule/dateKey";
import { dayPlanWorkMinutes, loadDayPlans } from "@/lib/schedule/day-plans";
import { STATUS_CONFIRMED, STATUS_OCCUPANCY } from "@/features/analytics/domain/status-map";

type KpiMetric = {
  value: number;
  delta: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
};

export type DashboardKpi = {
  revenue: KpiMetric;
  bookingsCount: KpiMetric;
  uniqueClients: KpiMetric;
  returnRate: KpiMetric;
  avgCheck: KpiMetric;
  cancellationRate: KpiMetric;
  noShowRate: KpiMetric;
  occupancyRate: KpiMetric;
};

export type OccupancyPoint = {
  weekday: number;
  label: string;
  bookedMinutes: number;
  capacityMinutes: number | null;
  rate: number | null;
};

type Snapshot = {
  revenue: number;
  bookingsCount: number;
  uniqueClients: number;
  returnRate: number;
  avgCheck: number;
  cancellationRate: number;
  noShowRate: number;
  occupancyRate: number;
  occupancyByWeekday: number[];
};

function computeMetric(current: number, previous: number | null): KpiMetric {
  if (previous === null) {
    return { value: current, delta: 0, deltaPct: null, direction: "flat" };
  }
  const delta = current - previous;
  const pct = previous === 0 ? null : delta / previous;
  const direction = delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  return { value: current, delta, deltaPct: pct, direction };
}

function normalizeStatus(status: BookingStatus): BookingStatus {
  if (status === "NEW") return "PENDING";
  if (status === "PREPAID") return "CONFIRMED";
  if (status === "STARTED") return "IN_PROGRESS";
  if (status === "CANCELLED" || status === "NO_SHOW") return "REJECTED";
  return status;
}

function isCompleted(status: BookingStatus, endAtUtc: Date | null, now: Date): boolean {
  if (status === "FINISHED") return true;
  const normalized = normalizeStatus(status);
  if (!STATUS_CONFIRMED.includes(normalized)) return false;
  if (!endAtUtc) return false;
  return endAtUtc.getTime() < now.getTime();
}

function sumRevenue(items: Array<{ priceSnapshot: number }>): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
}

function sumDuration(
  items: Array<{ durationSnapshotMin: number }>,
  startAtUtc: Date | null,
  endAtUtc: Date | null
): number {
  const snapshot = items.reduce((sum, item) => sum + Math.max(0, item.durationSnapshotMin), 0);
  if (snapshot > 0) return snapshot;
  if (!startAtUtc || !endAtUtc) return 0;
  const diffMs = endAtUtc.getTime() - startAtUtc.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.round(diffMs / 60000);
}

function withinRange(dateKey: string, range: AnalyticsRange): boolean {
  return dateKey >= range.fromKey && dateKey <= range.toKey;
}

function buildSnapshot(input: {
  bookings: Array<{
    startAtUtc: Date | null;
    endAtUtc: Date | null;
    status: BookingStatus;
    clientUserId: string | null;
    serviceItems: Array<{ priceSnapshot: number; durationSnapshotMin: number }>;
  }>;
  range: AnalyticsRange;
  timeZone: string;
  /** Ёмкость ЭТОГО периода по дням недели, минуты (см. `capacityByWeekdayInRange`). */
  capacityByWeekday: number[];
}): Snapshot {
  const now = new Date();
  let revenue = 0;
  let bookingsCount = 0;
  let cancelled = 0;
  let noShow = 0;
  let totalCreated = 0;
  const clients = new Map<string, number>();
  const occupancyByWeekday = Array.from({ length: 7 }, () => 0);

  for (const booking of input.bookings) {
    if (!booking.startAtUtc) continue;
    const dateKey = toLocalDateKey(booking.startAtUtc, input.timeZone);
    if (!withinRange(dateKey, input.range)) continue;

    totalCreated += 1;
    const normalized = normalizeStatus(booking.status);
    if (booking.status === "NO_SHOW") {
      noShow += 1;
    } else if (booking.status === "CANCELLED" || booking.status === "REJECTED") {
      cancelled += 1;
    }

    if (isCompleted(booking.status, booking.endAtUtc, now)) {
      bookingsCount += 1;
      revenue += sumRevenue(booking.serviceItems);
      if (booking.clientUserId) {
        clients.set(booking.clientUserId, (clients.get(booking.clientUserId) ?? 0) + 1);
      }
    }

    if (STATUS_OCCUPANCY.includes(normalized)) {
      const weekday = getDayOfWeek(booking.startAtUtc, input.timeZone);
      occupancyByWeekday[weekday] += sumDuration(booking.serviceItems, booking.startAtUtc, booking.endAtUtc);
    }
  }

  const uniqueClients = clients.size;
  const returningClients = Array.from(clients.values()).filter((count) => count >= 2).length;
  const returnRate = uniqueClients > 0 ? returningClients / uniqueClients : 0;
  const avgCheck = bookingsCount > 0 ? Math.round(revenue / bookingsCount) : 0;
  const cancellationRate = totalCreated > 0 ? cancelled / totalCreated : 0;
  const noShowRate = totalCreated > 0 ? noShow / totalCreated : 0;

  const totalCapacity = input.capacityByWeekday.reduce((sum, minutes) => sum + minutes, 0);
  const totalBooked = occupancyByWeekday.reduce((sum, minutes) => sum + minutes, 0);
  const occupancyRate = totalCapacity > 0 ? totalBooked / totalCapacity : 0;

  return {
    revenue,
    bookingsCount,
    uniqueClients,
    returnRate,
    avgCheck,
    cancellationRate,
    noShowRate,
    occupancyRate,
    occupancyByWeekday,
  };
}

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — ёмкость в минутах на КАЖДУЮ дату периода по
 * движку (`loadDayPlans`): неделя, «Особые дни» (отпуск, свои часы), перерывы.
 * Раньше ёмкость была «часы шаблона недели × число таких дней недели в
 * периоде»: отпуск считался рабочим временем, перерывы — тоже, а график с
 * чередованием или датами (этап 2) так не выражается вовсе. День в режиме
 * «Фиксированное время» ёмкости в минутах не имеет и считается нулём.
 */
async function loadCapacityByDate(
  context: AnalyticsContext,
  range: { fromKey: string; toKey: string },
): Promise<Map<string, number>> {
  const providerIds =
    context.scope === "MASTER"
      ? [context.providerId]
      : context.masterFilterId
        ? [context.masterFilterId]
        : (
            await prisma.provider.findMany({
              where: { studioId: context.providerId, type: ProviderType.MASTER },
              select: { id: true },
            })
          ).map((provider) => provider.id);

  const plans = await loadDayPlans({
    providerIds,
    fromKey: range.fromKey,
    toKeyExclusive: addDaysToDateKey(range.toKey, 1),
  });
  const totals = new Map<string, number>();
  for (const byDate of plans.values()) {
    for (const [dateKey, plan] of byDate) {
      totals.set(dateKey, (totals.get(dateKey) ?? 0) + (dayPlanWorkMinutes(plan) ?? 0));
    }
  }
  return totals;
}

/** Ёмкость периода по дням недели (0 = вс … 6 = сб — как у `occupancyByWeekday`). */
function capacityByWeekdayInRange(
  capacityByDate: Map<string, number>,
  range: { fromKey: string; toKey: string },
): number[] {
  const totals = Array.from({ length: 7 }, () => 0);
  for (const dateKey of listDateKeysInclusive(range.fromKey, range.toKey)) {
    const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
    totals[weekday] += capacityByDate.get(dateKey) ?? 0;
  }
  return totals;
}

export async function getDashboardKpi(input: {
  context: AnalyticsContext;
  range: AnalyticsRange;
  prevRange: AnalyticsRange | null;
}): Promise<{ kpi: DashboardKpi; occupancy: OccupancyPoint[] }> {
  const combinedRange = input.prevRange
    ? {
        fromUtc: input.prevRange.fromUtc,
        toUtcExclusive: input.range.toUtcExclusive,
        fromKey: input.prevRange.fromKey,
        toKey: input.range.toKey,
        days: input.range.days + input.prevRange.days,
      }
    : input.range;

  const bookings = await prisma.booking.findMany({
    where: {
      AND: [buildScopeWhere(input.context), buildStartAtRange(combinedRange)],
    },
    select: {
      startAtUtc: true,
      endAtUtc: true,
      status: true,
      clientUserId: true,
      serviceItems: {
        select: {
          priceSnapshot: true,
          durationSnapshotMin: true,
        },
      },
    },
  });

  const capacityByDate = await loadCapacityByDate(input.context, combinedRange);
  const currentCapacity = capacityByWeekdayInRange(capacityByDate, input.range);
  const current = buildSnapshot({
    bookings,
    range: input.range,
    timeZone: input.context.timeZone,
    capacityByWeekday: currentCapacity,
  });

  const previous = input.prevRange
    ? buildSnapshot({
        bookings,
        range: input.prevRange,
        timeZone: input.context.timeZone,
        capacityByWeekday: capacityByWeekdayInRange(capacityByDate, input.prevRange),
      })
    : null;

  const kpi: DashboardKpi = {
    revenue: computeMetric(current.revenue, previous?.revenue ?? null),
    bookingsCount: computeMetric(current.bookingsCount, previous?.bookingsCount ?? null),
    uniqueClients: computeMetric(current.uniqueClients, previous?.uniqueClients ?? null),
    returnRate: computeMetric(current.returnRate, previous?.returnRate ?? null),
    avgCheck: computeMetric(current.avgCheck, previous?.avgCheck ?? null),
    cancellationRate: computeMetric(current.cancellationRate, previous?.cancellationRate ?? null),
    noShowRate: computeMetric(current.noShowRate, previous?.noShowRate ?? null),
    occupancyRate: computeMetric(current.occupancyRate, previous?.occupancyRate ?? null),
  };

  const weekdayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const occupancy: OccupancyPoint[] = current.occupancyByWeekday.map((bookedMinutes, idx) => {
    const capacityMinutes = currentCapacity[idx];
    const rate = capacityMinutes > 0 ? bookedMinutes / capacityMinutes : null;
    return {
      weekday: idx,
      label: weekdayLabels[idx],
      bookedMinutes,
      capacityMinutes: capacityMinutes > 0 ? capacityMinutes : null,
      rate,
    };
  });

  return { kpi, occupancy };
}
