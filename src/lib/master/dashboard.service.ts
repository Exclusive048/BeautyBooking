import { BookingStatus } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getPendingBookingsForMaster, type PendingBookingRow } from "@/lib/bookings/master-pending-list";
import { getUnansweredReviewsForMaster, type UnansweredReviewRow } from "@/lib/reviews/unanswered-list";

export type DashboardBooking = {
  id: string;
  startAtUtc: Date;
  endAtUtc: Date;
  status: BookingStatus;
  /** Client's user id when the booking is linked to a registered
   * user — needed by the dashboard row to build the master-side chat
   * deep-link `?key=<providerId>:<clientUserId>`. `null` for guest
   * bookings (no chat thread). */
  clientUserId: string | null;
  clientName: string;
  serviceTitle: string;
  durationMin: number;
  price: number;
  isPending: boolean;
  isCurrent: boolean;
  isNext: boolean;
  changeComment: string | null;
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
  };
  kpis: {
    todayRevenue: number;
    todayBookingsCount: number;
    todayCapacityHours: number;
    weekRevenue: number;
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

function startOfTodayUtc(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfTodayUtc(now: Date): Date {
  const d = startOfTodayUtc(now);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

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
  // Read the WeeklyScheduleConfig for today's weekday and combine the
  // template start/end (HH:mm) with today's date in UTC. Override-aware
  // routing lives in the schedule engine; for the dashboard's "free slot
  // hint" we rely on the template — close enough, and avoids pulling the
  // full ScheduleEngine into the layout's render path.
  const weekday = args.now.getUTCDay();
  const config = await prisma.weeklyScheduleConfig.findUnique({
    where: { providerId: args.providerId },
    select: {
      days: {
        where: { weekday, isActive: true },
        select: {
          template: { select: { startLocal: true, endLocal: true } },
        },
      },
    },
  });
  const day = config?.days[0];
  if (!day?.template) return { start: null, end: null };

  const today = new Date(args.now);
  today.setUTCHours(0, 0, 0, 0);
  const buildLocal = (hhmm: string): Date | null => {
    const [hStr, mStr] = hhmm.split(":");
    const h = Number.parseInt(hStr ?? "", 10);
    const m = Number.parseInt(mStr ?? "", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const d = new Date(today);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };
  return {
    start: buildLocal(day.template.startLocal),
    end: buildLocal(day.template.endLocal),
  };
}

/**
 * Single round-trip aggregation for the master dashboard. Wrapped in
 * `React.cache` so re-calls inside the same RSC render are free.
 */
export const getMasterDashboardData = cache(
  async (input: { masterId: string; now?: Date }): Promise<DashboardData> => {
    const now = input.now ?? new Date();
    const todayStart = startOfTodayUtc(now);
    const todayEnd = endOfTodayUtc(now);
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);

    const master = await prisma.provider.findUnique({
      where: { id: input.masterId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        publicUsername: true,
        timezone: true,
        studioId: true,
      },
    });
    if (!master) {
      throw new Error(`Master not found: ${input.masterId}`);
    }
    const isSolo = master.studioId === null;

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
          providerId: input.masterId,
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
          service: {
            select: { name: true, title: true, durationMin: true, price: true },
          },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
      prisma.booking.findMany({
        where: {
          providerId: input.masterId,
          startAtUtc: { gte: weekStart, lt: todayEnd },
          status: { in: REVENUE_STATUSES },
        },
        select: {
          startAtUtc: true,
          clientUserId: true,
          createdAt: true,
          service: { select: { price: true } },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
      prisma.service.findMany({
        where: { providerId: input.masterId, isEnabled: true, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, title: true, durationMin: true, price: true },
      }),
      getPendingBookingsForMaster(input.masterId, 3),
      getUnansweredReviewsForMaster(input.masterId, 2),
      resolveTodayWorkingWindow({ providerId: input.masterId, timezone: master.timezone, now }),
    ]);

    const todayBookings: DashboardBooking[] = todayRows
      .filter(
        (row): row is typeof row & { startAtUtc: Date; endAtUtc: Date } =>
          row.startAtUtc !== null && row.endAtUtc !== null,
      )
      .map((row) => {
        const isPending =
          row.status === BookingStatus.PENDING || row.status === BookingStatus.CHANGE_REQUESTED;
        const isCurrent = now >= row.startAtUtc && now < row.endAtUtc;
        return {
          id: row.id,
          startAtUtc: row.startAtUtc,
          endAtUtc: row.endAtUtc,
          status: row.status,
          clientUserId: row.clientUserId,
          clientName: row.clientName,
          serviceTitle: row.service.title?.trim() || row.service.name,
          durationMin: row.service.durationMin,
          price: bookingPriceFromItems(row),
          isPending,
          isCurrent,
          isNext: false,
          changeComment: row.changeComment,
        };
      });

    // Mark the next upcoming booking (first one ahead of `now`) so the hero
    // widget can render its countdown.
    const nextIndex = todayBookings.findIndex((b) => b.startAtUtc > now);
    if (nextIndex >= 0) todayBookings[nextIndex]!.isNext = true;

    const upcomingBookings = todayBookings.filter((b) => b.endAtUtc > now);

    // Today revenue: only revenue-positive statuses count.
    const todayRevenue = todayRows
      .filter((row) => REVENUE_STATUSES.includes(row.status))
      .reduce((sum, row) => sum + bookingPriceFromItems(row), 0);

    const weekRevenue = weekRows.reduce(
      (sum, row) => sum + bookingPriceFromItems(row),
      0,
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
            providerId: input.masterId,
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
      master: {
        id: master.id,
        name: master.name,
        avatarUrl: master.avatarUrl,
        publicUsername: master.publicUsername,
        timezone: master.timezone,
      },
      kpis: {
        todayRevenue,
        todayBookingsCount,
        todayCapacityHours,
        weekRevenue,
        newClientsCount,
        returningClientsCount,
      },
      pendingBookings,
      unansweredReviews,
      freeSlot,
    };
  },
);
