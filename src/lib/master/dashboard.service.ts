import { BookingStatus } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { getPendingBookingsForMaster, type PendingBookingRow } from "@/lib/bookings/master-pending-list";
import { getOrCreateConversationSlug } from "@/lib/chat/conversation-slug";
import { getUnansweredReviewsForMaster, type UnansweredReviewRow } from "@/lib/reviews/unanswered-list";
import { toLocalDateKey, toUtcFromLocalDateTime } from "@/lib/schedule/timezone";
import { addDaysToDateKey, dateFromLocalDateKey, localDayRangeUtc } from "@/lib/schedule/dateKey";
import { dayPlanHours, loadDayPlans } from "@/lib/schedule/day-plans";
import { timeToMinutes } from "@/lib/schedule/time";
import {
  BOOKING_WORK_CONTEXT_SELECT,
  resolveBookingWorkContext,
  shouldShowWorkContext,
  splitRevenueByWorkContext,
  type BookingWorkContext,
  type RevenueSplit,
} from "@/lib/bookings/work-context";
import type { MasterWorkProfiles } from "@/lib/master/access";

export type DashboardBooking = {
  id: string;
  startAtUtc: Date;
  endAtUtc: Date;
  status: BookingStatus;
  /** Client's user id when the booking is linked to a registered
   * user. `null` for guest bookings (no chat thread). */
  clientUserId: string | null;
  /** Opaque public slug for the master ↔ client chat thread.
   * Server-resolved here so `<BookingRowActions>` can build the chat
   * deep-link without exposing internal cuids. `null` for guest
   * bookings (no clientUserId → no thread). chat-url-fix. */
  chatSlug: string | null;
  clientName: string;
  serviceTitle: string;
  durationMin: number;
  price: number;
  isPending: boolean;
  isCurrent: boolean;
  isNext: boolean;
  changeComment: string | null;
  /**
   * MASTER-BOOKING-UI-FIX-A: surfaces who must respond when the booking
   * is in CHANGE_REQUESTED. The dashboard action-buttons gate
   * approve/reject visibility on this so the initiator side sees
   * «Ожидаем ответа» instead of buttons that the backend will reject.
   */
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /** STUDIO-MASTER-PROFILES (этап 3): личная запись или запись студии. */
  workContext: BookingWorkContext;
};

export type DashboardServiceLite = {
  id: string;
  title: string;
  durationMin: number;
  price: number;
};

export type FreeSlotOpportunity = {
  startAtUtc: Date;
  endAtUtc: Date;
  durationMin: number;
};

export type DashboardData = {
  /** Today's bookings ordered chronologically (all statuses except CANCELLED/REJECTED). */
  todayBookings: DashboardBooking[];
  /** Bookings still ahead of `now` from today's set. Capped to avoid overflow in the UI. */
  upcomingBookings: DashboardBooking[];
  /** Master's services (used by the manual-booking modal). */
  services: DashboardServiceLite[];
  /** Whether the master operates solo — gates the manual booking flow. */
  isSolo: boolean;
  /** Master's display info for hero / chip. */
  master: {
    id: string;
    name: string;
    avatarUrl: string | null;
    publicUsername: string | null;
    timezone: string;
    /** QA-115 (FIX-06): studio affiliation; `null` for independent masters. */
    studio: { name: string } | null;
  };
  /** STUDIO-MASTER-PROFILES (этап 3): показывать ли пометку «Личная / Студия». */
  showWorkContext: boolean;
  kpis: {
    todayRevenue: number;
    todayRevenueSplit: RevenueSplit;
    todayBookingsCount: number;
    todayCapacityHours: number;
    weekRevenue: number;
    weekRevenueSplit: RevenueSplit;
    newClientsCount: number;
    returningClientsCount: number;
  };
  pendingBookings: PendingBookingRow[];
  unansweredReviews: UnansweredReviewRow[];
  freeSlot: FreeSlotOpportunity | null;
};

const REVENUE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.PREPAID,
  BookingStatus.STARTED,
  BookingStatus.FINISHED,
];

function bookingPriceFromItems(item: {
  serviceItems: Array<{ priceSnapshot: number }>;
  service: { price: number };
}): number {
  if (item.serviceItems.length > 0) {
    return item.serviceItems.reduce((sum, si) => sum + si.priceSnapshot, 0);
  }
  return item.service.price;
}

/**
 * Find a >= 60-minute gap inside today's working window that isn't covered
 * by a CONFIRMED/PENDING booking. We look for the FIRST such gap from now;
 * a single opportunity is enough for the dashboard. Returns null when there
 * is no working window today or no qualifying gap.
 */
function findFirstFreeSlotToday(input: {
  workingStart: Date | null;
  workingEnd: Date | null;
  bookings: Array<{ startAtUtc: Date; endAtUtc: Date }>;
  now: Date;
}): FreeSlotOpportunity | null {
  const { workingStart, workingEnd, bookings, now } = input;
  if (!workingStart || !workingEnd) return null;

  const windowStart = now > workingStart ? now : workingStart;
  if (windowStart >= workingEnd) return null;

  const sorted = [...bookings].sort(
    (a, b) => a.startAtUtc.getTime() - b.startAtUtc.getTime(),
  );

  let cursor = windowStart;
  for (const b of sorted) {
    if (b.endAtUtc <= cursor) continue;
    if (b.startAtUtc >= workingEnd) break;
    if (b.startAtUtc > cursor) {
      const gapMin = Math.floor((b.startAtUtc.getTime() - cursor.getTime()) / 60000);
      if (gapMin >= 60) {
        return {
          startAtUtc: cursor,
          endAtUtc: b.startAtUtc,
          durationMin: gapMin,
        };
      }
    }
    if (b.endAtUtc > cursor) cursor = b.endAtUtc;
  }
  if (cursor < workingEnd) {
    const gapMin = Math.floor((workingEnd.getTime() - cursor.getTime()) / 60000);
    if (gapMin >= 60) {
      return {
        startAtUtc: cursor,
        endAtUtc: workingEnd,
        durationMin: gapMin,
      };
    }
  }
  return null;
}

async function resolveTodayWorkingWindow(args: {
  providerId: string;
  timezone: string;
  now: Date;
}): Promise<{ start: Date | null; end: Date | null }> {
  // SCHEDULE-PATTERNS-01 (этап 1): часы на сегодня — из движка (`loadDayPlans`):
  // выходной или отпуск на сегодня («Особый день») дашборд раньше не видел,
  // он читал только недельный шаблон. Заодно исправлен пояс: «10:00» шаблона
  // собиралось через `setUTCHours`, то есть как 10:00 UTC, и у московского
  // мастера подсказка свободного окошка уезжала на 3 часа (rule 17, salon-tz).
  const todayKey = toLocalDateKey(args.now, args.timezone);
  const plans = await loadDayPlans({
    providerIds: [args.providerId],
    fromKey: todayKey,
    toKeyExclusive: addDaysToDateKey(todayKey, 1),
    now: args.now,
  });
  const plan = plans.get(args.providerId)?.get(todayKey);
  // День «Фиксированное время» хранится как 00:00–23:55: ни ёмкость в часах,
  // ни «свободно с … до …» из него не выводятся.
  if (!plan || plan.fixedStarts) return { start: null, end: null };
  const hours = dayPlanHours(plan);
  if (!hours.start || !hours.end) return { start: null, end: null };

  const dayForLocal = dateFromLocalDateKey(todayKey, args.timezone);
  const toInstant = (hhmm: string): Date | null => {
    const minutes = timeToMinutes(hhmm);
    if (minutes === null) return null;
    return toUtcFromLocalDateTime(dayForLocal, Math.floor(minutes / 60), minutes % 60, args.timezone);
  };
  return { start: toInstant(hours.start), end: toInstant(hours.end) };
}

/**
 * Single round-trip aggregation for the master dashboard. Wrapped in
 * `React.cache` so re-calls inside the same RSC render are free.
 */
export const getMasterDashboardData = cache(
  async (input: {
    masterId: string;
    /**
     * STUDIO-MASTER-PROFILES (этап 4): все рабочие профили мастера (личный и
     * в студиях) — записи, выручка и запросы берутся по всем. Без него —
     * только `masterId`.
     */
    workProfiles?: MasterWorkProfiles;
    now?: Date;
  }): Promise<DashboardData> => {
    const now = input.now ?? new Date();

    const master = await prisma.provider.findUnique({
      where: { id: input.masterId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        publicUsername: true,
        timezone: true,
        studioId: true,
        // QA-115 (FIX-06): studio affiliation (studioId references the studio's provider row).
        studio: { select: { name: true } },
      },
    });
    if (!master) {
      throw new Error(`Master not found: ${input.masterId}`);
    }
    // MOBILE-MASTER-C (rule 17, salon-tz): «сегодня» и «7 дней» — сутки САЛОНА.
    // Раньше окно было UTC-сутками (`setUTCHours(0)`): у московского мастера
    // записи 00:00–03:00 выпадали из «Сегодня», а у мастера на UTC+10 утро до
    // 10:00 показывалось вчерашним днём.
    const todayKey = toLocalDateKey(now, master.timezone);
    const { startUtc: todayStart, endExclusiveUtc: todayEnd } = localDayRangeUtc(todayKey, master.timezone);
    const weekStart = localDayRangeUtc(addDaysToDateKey(todayKey, -6), master.timezone).startUtc;
    const isSolo = master.studioId === null;
    const workProfileIds = input.workProfiles?.allIds ?? [input.masterId];
    const worksInStudio = input.workProfiles?.worksInStudio ?? !isSolo;
    // Бейдж студии: пока студийную работу несёт сам личный профиль — его студия;
    // после разделения профилей — студия профиля мастера в студии.
    const studioForChip =
      master.studio ??
      (input.workProfiles?.studioProfiles[0]
        ? await prisma.provider.findUnique({
            where: { id: input.workProfiles.studioProfiles[0].studioProviderId },
            select: { name: true },
          })
        : null);

    // Parallelise everything — none of these queries depend on each other.
    const [
      todayRows,
      weekRows,
      servicesRaw,
      pendingBookings,
      unansweredReviews,
      workingWindow,
    ] = await Promise.all([
      prisma.booking.findMany({
        where: {
          // F1: performer predicate — see master-booking-scope.ts.
          ...masterPerformedBookingWhere(workProfileIds),
          startAtUtc: { gte: todayStart, lt: todayEnd },
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.NO_SHOW] },
        },
        orderBy: { startAtUtc: "asc" },
        select: {
          id: true,
          startAtUtc: true,
          endAtUtc: true,
          status: true,
          clientName: true,
          clientUserId: true,
          changeComment: true,
          // MASTER-BOOKING-UI-FIX-A: needed for initiator-aware
          // dashboard action buttons on CHANGE_REQUESTED bookings (#2а).
          actionRequiredBy: true,
          service: {
            select: { name: true, title: true, durationMin: true, price: true },
          },
          serviceItems: { select: { priceSnapshot: true } },
          ...BOOKING_WORK_CONTEXT_SELECT,
        },
      }),
      prisma.booking.findMany({
        where: {
          ...masterPerformedBookingWhere(workProfileIds),
          startAtUtc: { gte: weekStart, lt: todayEnd },
          status: { in: REVENUE_STATUSES },
        },
        select: {
          startAtUtc: true,
          clientUserId: true,
          createdAt: true,
          service: { select: { price: true } },
          serviceItems: { select: { priceSnapshot: true } },
          ...BOOKING_WORK_CONTEXT_SELECT,
        },
      }),
      prisma.service.findMany({
        where: { providerId: input.masterId, isEnabled: true, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, title: true, durationMin: true, price: true },
      }),
      getPendingBookingsForMaster(workProfileIds, 3),
      getUnansweredReviewsForMaster(input.masterId, 2),
      resolveTodayWorkingWindow({ providerId: input.masterId, timezone: master.timezone, now }),
    ]);

    const validTodayRows = todayRows.filter(
      (row): row is typeof row & { startAtUtc: Date; endAtUtc: Date } =>
        row.startAtUtc !== null && row.endAtUtc !== null,
    );

    // Resolve chat slugs in parallel for bookings that have a
    // clientUserId — keeps `<BookingRowActions>` free of cuids in the
    // URL it builds. Guests (no clientUserId) get `null` and the
    // action island hides the chat button. chat-url-fix.
    const chatSlugs = await Promise.all(
      validTodayRows.map((row) =>
        row.clientUserId
          ? getOrCreateConversationSlug({
              providerId: input.masterId,
              clientUserId: row.clientUserId,
            })
          : Promise.resolve(null),
      ),
    );

    const todayBookings: DashboardBooking[] = validTodayRows.map((row, index) => {
      const isPending =
        row.status === BookingStatus.PENDING || row.status === BookingStatus.CHANGE_REQUESTED;
      const isCurrent = now >= row.startAtUtc && now < row.endAtUtc;
      return {
        id: row.id,
        startAtUtc: row.startAtUtc,
        endAtUtc: row.endAtUtc,
        status: row.status,
        clientUserId: row.clientUserId,
        chatSlug: chatSlugs[index] ?? null,
        clientName: row.clientName,
        serviceTitle: row.service.title?.trim() || row.service.name,
        durationMin: row.service.durationMin,
        price: bookingPriceFromItems(row),
        isPending,
        isCurrent,
        isNext: false,
        changeComment: row.changeComment,
        actionRequiredBy: row.actionRequiredBy ?? null,
        workContext: resolveBookingWorkContext(row),
      };
    });

    // Mark the next upcoming booking (first one ahead of `now`) so the hero
    // widget can render its countdown.
    const nextIndex = todayBookings.findIndex((b) => b.startAtUtc > now);
    if (nextIndex >= 0) todayBookings[nextIndex]!.isNext = true;

    const upcomingBookings = todayBookings.filter((b) => b.endAtUtc > now);

    // Today revenue: only revenue-positive statuses count.
    const todayRevenueRows = todayRows.filter((row) => REVENUE_STATUSES.includes(row.status));
    const todayRevenue = todayRevenueRows.reduce((sum, row) => sum + bookingPriceFromItems(row), 0);

    const weekRevenue = weekRows.reduce(
      (sum, row) => sum + bookingPriceFromItems(row),
      0,
    );
    // STUDIO-MASTER-PROFILES (этап 3): студийная выручка — оборот студии по
    // записям мастера, а не его доход; показывается отдельно от личной.
    const todayRevenueSplit = splitRevenueByWorkContext(
      todayRevenueRows.map((row) => ({ context: resolveBookingWorkContext(row), amount: bookingPriceFromItems(row) })),
    );
    const weekRevenueSplit = splitRevenueByWorkContext(
      weekRows.map((row) => ({ context: resolveBookingWorkContext(row), amount: bookingPriceFromItems(row) })),
    );

    // New clients in the last 7 days = distinct clientUserId whose earliest
    // booking with this master fell inside the window. We approximate by
    // counting clients whose first appearance in `weekRows` is the only
    // appearance with this provider — close enough at MVP scale.
    const clientFirstSeen = new Map<string, Date>();
    for (const row of weekRows) {
      if (!row.clientUserId) continue;
      const existing = clientFirstSeen.get(row.clientUserId);
      const candidate = row.startAtUtc ?? row.createdAt;
      if (!candidate) continue;
      if (!existing || candidate < existing) {
        clientFirstSeen.set(row.clientUserId, candidate);
      }
    }
    const clientIds = Array.from(clientFirstSeen.keys());
    const earlierBookings = clientIds.length
      ? await prisma.booking.findMany({
          where: {
            ...masterPerformedBookingWhere(workProfileIds),
            clientUserId: { in: clientIds },
            startAtUtc: { lt: weekStart },
            status: { in: REVENUE_STATUSES },
          },
          select: { clientUserId: true },
        })
      : [];
    const returningSet = new Set(
      earlierBookings.map((b) => b.clientUserId).filter((id): id is string => Boolean(id)),
    );
    const newClientsCount = clientIds.filter((id) => !returningSet.has(id)).length;
    const returningClientsCount = clientIds.length - newClientsCount;

    const todayBookingsCount = todayBookings.length;
    const todayCapacityHours = workingWindow.start && workingWindow.end
      ? Math.max(
          0,
          Math.round((workingWindow.end.getTime() - workingWindow.start.getTime()) / 3600000),
        )
      : 0;

    const freeSlot = findFirstFreeSlotToday({
      workingStart: workingWindow.start,
      workingEnd: workingWindow.end,
      bookings: todayBookings.map((b) => ({ startAtUtc: b.startAtUtc, endAtUtc: b.endAtUtc })),
      now,
    });

    const services: DashboardServiceLite[] = servicesRaw.map((s) => ({
      id: s.id,
      title: s.title?.trim() || s.name,
      durationMin: s.durationMin,
      price: s.price,
    }));

    return {
      todayBookings,
      upcomingBookings,
      services,
      isSolo,
      showWorkContext: shouldShowWorkContext({
        masterInStudio: worksInStudio,
        contexts: [
          ...todayBookings.map((b) => b.workContext),
          ...pendingBookings.map((b) => b.workContext),
        ],
      }),
      master: {
        id: master.id,
        name: master.name,
        avatarUrl: master.avatarUrl,
        publicUsername: master.publicUsername,
        timezone: master.timezone,
        studio: studioForChip ? { name: studioForChip.name } : null,
      },
      kpis: {
        todayRevenue,
        todayRevenueSplit,
        todayBookingsCount,
        todayCapacityHours,
        weekRevenue,
        weekRevenueSplit,
        newClientsCount,
        returningClientsCount,
      },
      pendingBookings,
      unansweredReviews,
      freeSlot,
    };
  },
);
