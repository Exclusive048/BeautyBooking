import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";
import { resolveRangeWithCompare, type AnalyticsRange } from "@/features/analytics/domain/date-range";
import { getBookingsFunnel } from "@/features/analytics/domain/bookings";
import { getDashboardKpi } from "@/features/analytics/domain/kpi";
import { getAtRiskClients, getNewVsReturning } from "@/features/analytics/domain/clients";
import type { MasterStats } from "@/lib/advisor/types";

const NO_SHOW_WINDOW_DAYS = 90;
const DEAD_SLOTS_WINDOW_DAYS = 60;
const NEW_CLIENTS_WINDOW_DAYS = 30;
const AT_RISK_WINDOW_DAYS = 180;
const AT_RISK_THRESHOLD_DAYS = 45;
const LOW_RATED_LOOKBACK_DAYS = 180;
const LOW_RATED_THRESHOLD = 4.0;
const LOW_RATED_MIN_REVIEWS = 3;

async function buildMasterAnalyticsContext(providerId: string): Promise<AnalyticsContext> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, timezone: true },
  });
  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  return {
    scope: "MASTER",
    providerId: provider.id,
    studioId: null,
    studioProviderId: null,
    masterFilterId: null,
    timeZone: provider.timezone,
  };
}

function buildRollingRange(days: number, timeZone: string): AnalyticsRange {
  const safeDays = Math.max(1, Math.floor(days));
  const todayKey = toLocalDateKey(new Date(), timeZone);
  const fromKey = addDaysToDateKey(todayKey, -(safeDays - 1));
  return resolveRangeWithCompare({
    period: "custom",
    timeZone,
    from: fromKey,
    to: todayKey,
    compare: false,
  }).range;
}

async function findLowRatedService(masterId: string, timeZone: string): Promise<{ name: string; rating: number } | null> {
  const range = buildRollingRange(LOW_RATED_LOOKBACK_DAYS, timeZone);
  const reviews = await prisma.review.findMany({
    where: {
      targetType: "provider",
      targetId: masterId,
      bookingId: { not: null },
      createdAt: { gte: range.fromUtc },
    },
    select: {
      rating: true,
      booking: {
        select: {
          service: { select: { id: true, name: true, title: true } },
        },
      },
    },
  });

  const stats = new Map<string, { name: string; sum: number; count: number }>();
  for (const review of reviews) {
    const service = review.booking?.service;
    if (!service) continue;
    const entry = stats.get(service.id);
    const name = service.title?.trim() || service.name;
    if (!entry) {
      stats.set(service.id, { name, sum: review.rating, count: 1 });
      continue;
    }
    entry.sum += review.rating;
    entry.count += 1;
  }

  const candidates = Array.from(stats.values())
    .filter((item) => item.count >= LOW_RATED_MIN_REVIEWS)
    .map((item) => ({ name: item.name, rating: item.sum / item.count, count: item.count }))
    .filter((item) => item.rating < LOW_RATED_THRESHOLD);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.rating - b.rating || b.count - a.count);
  const worst = candidates[0];
  return { name: worst.name, rating: Number(worst.rating.toFixed(1)) };
}

export async function collectMasterStats(providerId: string): Promise<MasterStats> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      type: true,
      timezone: true,
      avatarUrl: true,
      description: true,
      studioId: true,
    },
  });
  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const context = await buildMasterAnalyticsContext(provider.id);

  const [
    portfolioCount,
    totalReviews,
    workingDaysPerWeek,
    servicesWithoutPriceCount,
  ] = await Promise.all([
    prisma.portfolioItem.count({ where: { masterId: provider.id } }),
    prisma.review.count({ where: { targetType: "provider", targetId: provider.id } }),
    prisma.weeklyScheduleDay.count({
      where: { isActive: true, config: { providerId: provider.id } },
    }),
    provider.studioId
      ? Promise.resolve(0)
      : prisma.service.count({
          where: { providerId: provider.id, price: { lte: 0 } },
        }),
  ]);

  const [funnel, occupancy, newVsReturning, atRisk, lowRatedService] = await Promise.all([
    getBookingsFunnel({ context, range: buildRollingRange(NO_SHOW_WINDOW_DAYS, provider.timezone) }),
    getDashboardKpi({
      context,
      range: buildRollingRange(DEAD_SLOTS_WINDOW_DAYS, provider.timezone),
      prevRange: null,
    }),
    getNewVsReturning({
      context,
      range: buildRollingRange(NEW_CLIENTS_WINDOW_DAYS, provider.timezone),
      granularity: "day",
    }),
    getAtRiskClients({
      context,
      range: buildRollingRange(AT_RISK_WINDOW_DAYS, provider.timezone),
      thresholdDays: AT_RISK_THRESHOLD_DAYS,
    }),
    findLowRatedService(provider.id, provider.timezone),
  ]);

  const newClientsLast30Days = newVsReturning.points.reduce(
    (sum, point) => sum + point.newClients,
    0
  );

  const hasActiveSlots = workingDaysPerWeek > 0;
  const occupancyRate = occupancy.kpi.occupancyRate.value;
  const hasDeadTimeSlots = hasActiveSlots && occupancyRate < 0.2;

  return {
    hasAvatar: Boolean(provider.avatarUrl?.trim()),
    hasDescription: Boolean(provider.description?.trim()),
    portfolioCount,
    totalReviews,
    noShowRate: funnel.noShowRate,
    hasDeadTimeSlots,
    newClientsLast30Days,
    hasActiveSlots,
    atRiskClientsCount: atRisk.clients.length,
    lowRatedService,
    workingDaysPerWeek,
    servicesWithoutPriceCount,
  };
}
