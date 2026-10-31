import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveBookingClientKey } from "@/lib/crm/clients";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { targetReviewsWhere } from "@/lib/reviews/review-scope";
import { studioReviewsWhere } from "@/lib/reviews/studio-scope";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { dayPlanWorkMinutes, loadDayPlans } from "@/lib/schedule/day-plans";
import { loadSchedulePlan } from "@/lib/schedule/patterns";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { DayPlan } from "@/lib/schedule/types";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import { computeBookingStats, type InsightBookingRow } from "./booking-stats";
import {
  CABINET_AHEAD_DAYS,
  CABINET_HISTORY_DAYS,
  type CabinetProfileFacts,
  type CabinetReviewFacts,
  type CabinetRulesFacts,
  type CabinetServiceFact,
  type MasterCabinetFacts,
  type StudioCabinetFacts,
} from "./types";

/**
 * AI-CABINET-ANALYSIS — загрузчик фактов кабинета для главной: советы и
 * ИИ-разбор строятся из одного набора. Читает только своё: личный профиль
 * мастера (`providerId`) либо студию с её поверхностью записей
 * (`studioBookingsWhere`, инв. #45). Рабочие дни — движком (`loadDayPlans`,
 * инв. #47), таблиц расписания модуль не читает.
 *
 * Все запросы — одним `Promise.all`; записи — одним `findMany` по окну
 * «90 дней назад … 14 дней вперёд», дальше считает `computeBookingStats`.
 */

const DAY_MS = 86_400_000;
/** Потолок строк записей за окно: больше главной не нужно, а запрос остаётся предсказуемым. */
const BOOKINGS_TAKE = 5000;
const RECENT_REVIEWS_TAKE = 8;
const SERVICES_TAKE = 60;

const BOOKING_SELECT = {
  status: true,
  cancelledBy: true,
  source: true,
  createdAt: true,
  startAtUtc: true,
  endAtUtc: true,
  clientUserId: true,
  clientPhone: true,
  clientPhoneSnapshot: true,
  serviceId: true,
  masterProviderId: true,
} satisfies Prisma.BookingSelect;

const PROVIDER_SELECT = {
  name: true,
  description: true,
  avatarUrl: true,
  address: true,
  isPublished: true,
  timezone: true,
  socialVk: true,
  socialInstagram: true,
  socialTelegram: true,
  socialMax: true,
  minBookingHoursAhead: true,
  maxBookingDaysAhead: true,
  cancellationDeadlineHours: true,
  autoConfirmBookings: true,
  remindersEnabled: true,
  acceptNewClients: true,
} satisfies Prisma.ProviderSelect;

type ProviderRow = Prisma.ProviderGetPayload<{ select: typeof PROVIDER_SELECT }>;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function profileFacts(provider: ProviderRow): CabinetProfileFacts {
  return {
    name: provider.name,
    description: hasText(provider.description) ? provider.description!.trim() : null,
    hasAvatar: hasText(provider.avatarUrl),
    hasAddress: hasText(provider.address),
    isPublished: provider.isPublished,
    hasSocials: [provider.socialVk, provider.socialInstagram, provider.socialTelegram, provider.socialMax].some(
      hasText,
    ),
  };
}

function rulesFacts(provider: ProviderRow): CabinetRulesFacts {
  return {
    minBookingHoursAhead: provider.minBookingHoursAhead,
    maxBookingDaysAhead: provider.maxBookingDaysAhead,
    cancellationDeadlineHours: provider.cancellationDeadlineHours,
    autoConfirmBookings: provider.autoConfirmBookings,
    remindersEnabled: provider.remindersEnabled,
    acceptNewClients: provider.acceptNewClients,
  };
}

function bookingWindow(now: Date): Prisma.BookingWhereInput {
  return {
    startAtUtc: {
      gte: new Date(now.getTime() - CABINET_HISTORY_DAYS * DAY_MS),
      lt: new Date(now.getTime() + CABINET_AHEAD_DAYS * DAY_MS),
    },
  };
}

async function loadBookingRows(scope: Prisma.BookingWhereInput, now: Date): Promise<InsightBookingRow[]> {
  const rows = await prisma.booking.findMany({
    where: { AND: [scope, bookingWindow(now)] },
    select: BOOKING_SELECT,
    orderBy: { startAtUtc: "desc" },
    take: BOOKINGS_TAKE,
  });
  return rows.map((row) => ({
    status: row.status,
    cancelledBy: row.cancelledBy,
    source: row.source,
    createdAt: row.createdAt,
    startAtUtc: row.startAtUtc,
    endAtUtc: row.endAtUtc,
    clientKey: resolveBookingClientKey(row),
    serviceId: row.serviceId,
    masterProviderId: row.masterProviderId,
  }));
}

async function loadReviewFacts(
  activeWhere: Prisma.ReviewWhereInput,
  unansweredWhere: Prisma.ReviewWhereInput,
): Promise<CabinetReviewFacts> {
  const [aggregate, unanswered, recent] = await Promise.all([
    prisma.review.aggregate({ where: activeWhere, _count: { _all: true }, _avg: { rating: true } }),
    prisma.review.count({ where: unansweredWhere }),
    prisma.review.findMany({
      where: { AND: [activeWhere, { text: { not: null } }, { NOT: { text: "" } }] },
      select: { rating: true, text: true },
      orderBy: { createdAt: "desc" },
      take: RECENT_REVIEWS_TAKE,
    }),
  ]);
  return {
    count: aggregate._count._all,
    avg: aggregate._avg.rating === null ? null : Math.round(aggregate._avg.rating * 10) / 10,
    unanswered,
    recent: recent
      .filter((row): row is { rating: number; text: string } => hasText(row.text))
      .map((row) => ({ rating: row.rating, text: row.text.trim() })),
  };
}

function serviceFacts(
  services: Array<{ id: string; name: string; title: string | null; description: string | null; price: number; durationMin: number }>,
  bookingsByService: Map<string, number>,
): CabinetServiceFact[] {
  return services.map((service) => ({
    name: service.title?.trim() || service.name,
    priceKopeks: service.price,
    durationMin: service.durationMin,
    hasDescription: hasText(service.description),
    bookings: bookingsByService.get(service.id) ?? 0,
  }));
}

const SERVICE_SELECT = {
  id: true,
  name: true,
  title: true,
  description: true,
  price: true,
  durationMin: true,
} satisfies Prisma.ServiceSelect;

function aheadRange(now: Date, timeZone: string): { fromKey: string; toKeyExclusive: string } {
  const fromKey = toLocalDateKey(now, timeZone);
  return { fromKey, toKeyExclusive: addDaysToDateKey(fromKey, CABINET_AHEAD_DAYS) };
}

type AheadCapacity = { workingDays: number; workMinutes: number };

function capacityOf(plans: Map<string, DayPlan> | undefined): AheadCapacity {
  let workingDays = 0;
  let workMinutes = 0;
  if (!plans) return { workingDays, workMinutes };
  for (const plan of plans.values()) {
    if (!plan.isWorking) continue;
    workingDays += 1;
    // День «Фиксированное время» минут не знает — ёмкость по нему не считается.
    workMinutes += dayPlanWorkMinutes(plan) ?? 0;
  }
  return { workingDays, workMinutes };
}

export async function loadMasterCabinetFacts(input: {
  providerId: string;
  hotSlotsAllowed: boolean;
  now?: Date;
}): Promise<MasterCabinetFacts | null> {
  const now = input.now ?? new Date();
  const provider = await prisma.provider.findUnique({
    where: { id: input.providerId },
    select: PROVIDER_SELECT,
  });
  if (!provider) return null;
  const timeZone = provider.timezone;

  const reviewScope = targetReviewsWhere("provider", input.providerId);
  const [rows, services, packagesCount, portfolioCount, discountRule, plans, schedulePlan, reviews] =
    await Promise.all([
      loadBookingRows({ providerId: input.providerId }, now),
      prisma.service.findMany({
        where: { providerId: input.providerId, isActive: true },
        select: SERVICE_SELECT,
        orderBy: { createdAt: "asc" },
        take: SERVICES_TAKE,
      }),
      prisma.servicePackage.count({ where: { masterId: input.providerId, isEnabled: true } }),
      prisma.portfolioItem.count({ where: { masterId: input.providerId } }),
      prisma.discountRule.findUnique({ where: { providerId: input.providerId }, select: { isEnabled: true } }),
      loadDayPlans({ providerIds: [input.providerId], ...aheadRange(now, timeZone), now }),
      loadSchedulePlan(input.providerId, now),
      loadReviewFacts(reviewScope, {
        AND: [reviewScope, { targetType: "provider", replyText: null }],
      }),
    ]);

  const stats = computeBookingStats(rows, { now, timeZone });
  const capacity = capacityOf(plans.get(input.providerId));

  return {
    scope: "master",
    timeZone,
    profile: profileFacts(provider),
    services: serviceFacts(services, stats.bookingsByService),
    packagesCount,
    portfolioCount,
    bookings: stats.facts,
    schedule: {
      workingDaysAhead: capacity.workingDays,
      workMinutesAhead: capacity.workMinutes,
      bookedMinutesAhead: stats.bookedMinutesAhead,
      configuredUntil: schedulePlan.configuredUntil,
    },
    reviews,
    rules: rulesFacts(provider),
    hotSlots: { allowed: input.hotSlotsAllowed, enabled: discountRule?.isEnabled ?? false },
  };
}

export async function loadStudioCabinetFacts(input: {
  studioId: string;
  now?: Date;
}): Promise<StudioCabinetFacts | null> {
  const now = input.now ?? new Date();
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true, provider: { select: PROVIDER_SELECT } },
  });
  if (!studio) return null;
  const provider = studio.provider;
  const timeZone = provider.timezone;

  const masters = await prisma.provider.findMany({
    where: { studioId: studio.id, ...STUDIO_ACTIVE_MASTER_WHERE },
    select: {
      id: true,
      name: true,
      _count: { select: { masterServices: { where: { isEnabled: true, service: { isActive: true } } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const masterIds = masters.map((master) => master.id);

  const reviewScope: Prisma.ReviewWhereInput = { AND: [studioReviewsWhere(studio), ACTIVE_REVIEW_FILTER] };
  const [rows, services, packagesCount, portfolioCount, photosWithoutPerformer, pendingInvites, plans, reviews] =
    await Promise.all([
      loadBookingRows(studioBookingsWhere(studio.id), now),
      prisma.service.findMany({
        where: { providerId: studio.providerId, isActive: true },
        select: SERVICE_SELECT,
        orderBy: { createdAt: "asc" },
        take: SERVICES_TAKE,
      }),
      prisma.servicePackage.count({ where: { masterId: studio.providerId, isEnabled: true } }),
      prisma.portfolioItem.count({ where: { masterId: studio.providerId } }),
      prisma.portfolioItem.count({ where: { masterId: studio.providerId, performerId: null } }),
      prisma.studioInvite.count({ where: { studioId: studio.id, status: "PENDING" } }),
      loadDayPlans({ providerIds: masterIds, ...aheadRange(now, timeZone), now }),
      loadReviewFacts(reviewScope, { AND: [reviewScope, { replyText: null }] }),
    ]);

  const stats = computeBookingStats(rows, { now, timeZone });
  const masterFacts = masters.map((master) => {
    const capacity = capacityOf(plans.get(master.id));
    return {
      name: master.name,
      servicesCount: master._count.masterServices,
      workingDaysAhead: capacity.workingDays,
      workMinutesAhead: capacity.workMinutes,
      bookedMinutesAhead: stats.bookedMinutesAheadByMaster.get(master.id) ?? 0,
      completed: stats.completedByMaster.get(master.id) ?? 0,
    };
  });

  return {
    scope: "studio",
    timeZone,
    profile: profileFacts(provider),
    services: serviceFacts(services, stats.bookingsByService),
    packagesCount,
    portfolioCount,
    bookings: stats.facts,
    schedule: {
      workingDaysAhead: masterFacts.reduce((sum, master) => sum + master.workingDaysAhead, 0),
      workMinutesAhead: masterFacts.reduce((sum, master) => sum + master.workMinutesAhead, 0),
      bookedMinutesAhead: stats.bookedMinutesAhead,
      // Своего графика у студии нет — сроки расписания мастеров видны на «Графике команды».
      configuredUntil: null,
    },
    reviews,
    rules: rulesFacts(provider),
    masters: masterFacts,
    pendingInvites,
    photosWithoutPerformer,
  };
}
