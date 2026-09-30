import {
  BookingStatus,
  Prisma,
  ProviderType,
  type BookingSource,
} from "@prisma/client";
import { CLIENT_STATUS_THRESHOLDS } from "@/lib/master/clients-classifier";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { mapProposedReschedule } from "@/features/studio-cabinet/schedule/lib/reschedule-decision";
import {
  bookingsTimeRangeBounds,
  type BookingsTimeRange,
} from "../lib/time-range-filter";
import type {
  StudioBookingRow,
  StudioBookingsListData,
  StudioBookingsRangeCounts,
} from "./types";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";

const COMPLETED_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
];

const PAGE_SIZE = 50;

export type StudioBookingsFilters = {
  range: BookingsTimeRange;
  status?: BookingStatus | "all";
  masterId?: string | "all";
  search?: string;
};

function resolveBookingPriceKopeks(input: {
  service: { price: number } | null;
  serviceItems: Array<{ priceSnapshot: number }>;
}): number {
  const snapshotSum = input.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.priceSnapshot),
    0,
  );
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, input.service?.price ?? 0);
}

function clientKeyOf(input: {
  clientUserId: string | null;
  clientPhone: string | null;
  clientPhoneSnapshot: string | null;
}): string | null {
  if (input.clientUserId) return `user:${input.clientUserId}`;
  const raw =
    input.clientPhoneSnapshot?.trim() || input.clientPhone?.trim() || "";
  if (!raw) return null;
  const normalized = normalizeRussianPhone(raw) ?? raw;
  return `phone:${normalized}`;
}

function buildSearchFilter(search: string | undefined): Prisma.BookingWhereInput | null {
  const trimmed = search?.trim();
  if (!trimmed) return null;
  return {
    OR: [
      { clientName: { contains: trimmed, mode: "insensitive" } },
      { clientPhone: { contains: trimmed } },
      {
        service: {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" } },
            { title: { contains: trimmed, mode: "insensitive" } },
          ],
        },
      },
    ],
  };
}

/**
 * Lists bookings for the studio cabinet journal page. Supports filter
 * by time range / status / master, plus search across client name +
 * phone + service. Counts for the time-range chips are computed in
 * parallel via grouped queries.
 *
 * New client / VIP detection are batched per-page:
 *  - `prior bookings count per clientKey` via groupBy → drives "новый"
 *  - `lifetime revenue per clientKey` via groupBy → drives "VIP" by
 *    reusing the same threshold (`VIP_LTV_KOPEKS = 50 000 ₽`) the
 *    master cabinet's CRM uses (`classifyClient`). Studio admin sees
 *    the same VIP signal that the master would see on their own
 *    clients tab — consistent UX.
 */
export async function listStudioBookings(input: {
  studioId: string;
  filters: StudioBookingsFilters;
  cursor?: string | null;
}): Promise<StudioBookingsListData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: {
      id: true,
      providerId: true,
      provider: { select: { timezone: true } },
    },
  });
  if (!studio) {
    return {
      items: [],
      nextCursor: null,
      rangeCounts: { today: 0, tomorrow: 0, week: 0, all: 0 },
      timezone: "Europe/Moscow",
    };
  }
  const timezone = studio.provider.timezone;

  const baseScope: Prisma.BookingWhereInput = studioBookingsWhere(studio.id);

  const filters = input.filters;
  const bounds = bookingsTimeRangeBounds(filters.range, timezone);
  const whereRange: Prisma.BookingWhereInput = bounds.from
    ? { startAtUtc: { gte: bounds.from, lt: bounds.toExclusive ?? undefined } }
    : {};
  const whereStatus: Prisma.BookingWhereInput =
    filters.status && filters.status !== "all"
      ? { status: filters.status }
      : {};
  const whereMaster: Prisma.BookingWhereInput =
    filters.masterId && filters.masterId !== "all"
      ? { masterProviderId: filters.masterId }
      : {};
  const whereSearch = buildSearchFilter(filters.search);

  const where: Prisma.BookingWhereInput = {
    AND: [
      baseScope,
      whereRange,
      whereStatus,
      whereMaster,
      ...(whereSearch ? [whereSearch] : []),
    ],
  };

  // Range chip counts — parallel, ignore status/master/search so the
  // chips show "in this range total". This matches catalog convention
  // (chip count reflects the time slice).
  const todayBounds = bookingsTimeRangeBounds("today", timezone);
  const tomorrowBounds = bookingsTimeRangeBounds("tomorrow", timezone);
  const weekBounds = bookingsTimeRangeBounds("week", timezone);

  const [bookings, todayCount, tomorrowCount, weekCount, allCount] =
    await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: { startAtUtc: "asc" },
        take: PAGE_SIZE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          startAtUtc: true,
          endAtUtc: true,
          status: true,
          source: true,
          clientName: true,
          clientPhone: true,
          clientPhoneSnapshot: true,
          clientUserId: true,
          masterProviderId: true,
          providerId: true,
          // BOOKING-JOURNAL-SERVICEID-01: the booking's gating service, threaded
          // into the cell so Move-from-journal gates the master picker (parity
          // with the calendar path, which selects `serviceId` the same way).
          serviceId: true,
          // BOOKING-STUDIO-RESCHEDULE-PARITY-01: surface a pending client-proposed
          // reschedule so the journal row's action menu can offer accept/decline.
          proposedStartAt: true,
          proposedEndAt: true,
          actionRequiredBy: true,
          service: {
            select: { name: true, title: true, price: true, durationMin: true },
          },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
      prisma.booking.count({
        where: {
          AND: [
            baseScope,
            { startAtUtc: { gte: todayBounds.from!, lt: todayBounds.toExclusive! } },
          ],
        },
      }),
      prisma.booking.count({
        where: {
          AND: [
            baseScope,
            {
              startAtUtc: {
                gte: tomorrowBounds.from!,
                lt: tomorrowBounds.toExclusive!,
              },
            },
          ],
        },
      }),
      prisma.booking.count({
        where: {
          AND: [
            baseScope,
            { startAtUtc: { gte: weekBounds.from!, lt: weekBounds.toExclusive! } },
          ],
        },
      }),
      prisma.booking.count({ where: { AND: [baseScope] } }),
    ]);

  // Pagination cursor
  let nextCursor: string | null = null;
  let pageRows = bookings;
  if (bookings.length > PAGE_SIZE) {
    nextCursor = bookings[PAGE_SIZE - 1]!.id;
    pageRows = bookings.slice(0, PAGE_SIZE);
  }

  // Resolve master records once
  const masterIds = Array.from(
    new Set(
      pageRows
        .map((b) => b.masterProviderId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const masters =
    masterIds.length > 0
      ? await prisma.provider.findMany({
          where: { id: { in: masterIds }, type: ProviderType.MASTER },
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            tagline: true,
          },
        })
      : [];
  const masterById = new Map(masters.map((m) => [m.id, m]));

  // VIP / new-client detection: batch lifetime totals by clientKey
  // across the entire studio scope (not just the current page).
  const clientKeys = new Set<string>();
  for (const row of pageRows) {
    const key = clientKeyOf({
      clientUserId: row.clientUserId,
      clientPhone: row.clientPhone,
      clientPhoneSnapshot: row.clientPhoneSnapshot,
    });
    if (key) clientKeys.add(key);
  }

  type ClientStats = {
    completedCount: number;
    revenue: number;
  };
  const statsByKey = new Map<string, ClientStats>();

  if (clientKeys.size > 0) {
    // Single broad query — fan out client stats locally to avoid N+1.
    const lifetimeBookings = await prisma.booking.findMany({
      where: {
        ...baseScope,
        status: { in: COMPLETED_STATUSES },
      },
      select: {
        id: true,
        clientUserId: true,
        clientPhone: true,
        clientPhoneSnapshot: true,
        service: { select: { price: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
    });
    for (const booking of lifetimeBookings) {
      const key = clientKeyOf({
        clientUserId: booking.clientUserId,
        clientPhone: booking.clientPhone,
        clientPhoneSnapshot: booking.clientPhoneSnapshot,
      });
      if (!key || !clientKeys.has(key)) continue;
      const entry = statsByKey.get(key) ?? { completedCount: 0, revenue: 0 };
      entry.completedCount += 1;
      entry.revenue += resolveBookingPriceKopeks(booking);
      statsByKey.set(key, entry);
    }
  }

  const items: StudioBookingRow[] = pageRows.map((row) => {
    const masterId = row.masterProviderId ?? null;
    const master = masterId ? masterById.get(masterId) : null;
    const clientKey = clientKeyOf({
      clientUserId: row.clientUserId,
      clientPhone: row.clientPhone,
      clientPhoneSnapshot: row.clientPhoneSnapshot,
    });
    const stats = clientKey
      ? statsByKey.get(clientKey) ?? { completedCount: 0, revenue: 0 }
      : { completedCount: 0, revenue: 0 };

    const phoneRaw = row.clientPhoneSnapshot || row.clientPhone || null;
    const phone = phoneRaw
      ? normalizeRussianPhone(phoneRaw) ?? phoneRaw
      : null;

    return {
      id: row.id,
      startAtUtc: row.startAtUtc?.toISOString() ?? new Date(0).toISOString(),
      endAtUtc: row.endAtUtc?.toISOString() ?? new Date(0).toISOString(),
      master: {
        id: masterId ?? row.providerId,
        displayName: master?.name ?? "—",
        avatarUrl: master?.avatarUrl ?? null,
        specialization: master?.tagline ?? "",
      },
      client: {
        displayName: row.clientName || "—",
        phone,
        isNewClient: stats.completedCount <= 1,
        isVip: stats.revenue >= CLIENT_STATUS_THRESHOLDS.VIP_LTV_KOPEKS,
      },
      // BOOKING-JOURNAL-SERVICEID-01: `Booking.serviceId` is a non-null FK, so
      // this is always the real gating service (no `""` sentinel).
      serviceId: row.serviceId,
      service: {
        name: row.service?.title?.trim() || row.service?.name || "Услуга",
        durationMin: row.service?.durationMin ?? 0,
      },
      priceKopeks: resolveBookingPriceKopeks(row),
      source: row.source as BookingSource,
      status: row.status,
      ...mapProposedReschedule(row),
    };
  });

  const rangeCounts: StudioBookingsRangeCounts = {
    today: todayCount,
    tomorrow: tomorrowCount,
    week: weekCount,
    all: allCount,
  };

  return { items, nextCursor, rangeCounts, timezone };
}
