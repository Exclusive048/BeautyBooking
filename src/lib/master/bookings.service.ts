import { BookingStatus, ReviewTargetType } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";

export type ColumnId = "pending" | "confirmed" | "today" | "done" | "cancelled";

export type KanbanBookingItem = {
  id: string;
  column: ColumnId;
  rawStatus: BookingStatus;
  clientName: string;
  clientUserId: string | null;
  clientAvatarUrl: string | null;
  /** "Первый визит" / "12-й визит". `null` for guest bookings without a clientUserId. */
  visitTag: string | null;
  isNewClient: boolean;
  serviceTitle: string;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  /** Pre-formatted display label for date+time, computed against the master timezone. */
  whenLabel: string;
  price: number;
  /** Cancellation comment / change request reason — surfaced under cancelled cards. */
  changeComment: string | null;
  /** When the booking has a published review, contains its rating; null otherwise. */
  reviewRating: number | null;
};

export type KanbanFilters = {
  search?: string;
  /** "all" — no filter, "new" — клиенты без предыдущих visits, "regular" — 3+ visits. */
  tab?: "all" | "new" | "regular";
};

export type KanbanData = {
  columns: Record<ColumnId, KanbanBookingItem[]>;
  stats: {
    total: number;
    pendingSum: number;
    confirmedSum: number;
  };
};

const CANCELLED_WINDOW_DAYS = 30;
/** Lookahead horizon for confirmed/pending bookings — keeps the future column from filling with months-out reservations. */
const FUTURE_WINDOW_DAYS = 60;

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

/** Format "сб, 2 мая · 15:30" or "сегодня · 15:30" for booking cards. */
function formatWhenLabel(date: Date | null, now: Date): string {
  if (!date) return "—";
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDay) return `сегодня · ${hh}:${mm}`;
  const weekday = WEEKDAYS_SHORT[date.getDay()] ?? "";
  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()] ?? "";
  return `${weekday}, ${day} ${month} · ${hh}:${mm}`;
}

function bookingPrice(item: {
  serviceItems: Array<{ priceSnapshot: number }>;
  service: { price: number };
}): number {
  if (item.serviceItems.length > 0) {
    return item.serviceItems.reduce((sum, si) => sum + si.priceSnapshot, 0);
  }
  return item.service.price;
}

function pluralizeVisit(n: number): string {
  if (n === 0) return "Первый визит";
  if (n === 1) return "2-й визит";
  return `${n + 1}-й визит`;
}

/**
 * Single round-trip query for the master's bookings kanban board:
 *   - Pending / Confirmed / Today columns: future-leaning bookings within
 *     a 60-day horizon plus today's running ones
 *   - Done column: FINISHED bookings of last 60 days (limit 30 per column
 *     for the UI)
 *   - Cancelled column: REJECTED/CANCELLED/NO_SHOW within the last 30 days
 *
 * Visit-count enrichment uses a SINGLE `groupBy` on clientUserId — never
 * an N+1. Reviews are fetched in one batched query keyed by `bookingId`.
 *
 * Wrapped in `React.cache` so multiple server components in the same render
 * share one query without manual deduplication.
 */
export const getMasterBookingsForKanban = cache(
  async (input: { masterId: string; filters?: KanbanFilters; now?: Date }): Promise<KanbanData> => {
    const now = input.now ?? new Date();
    const filters = input.filters ?? {};
    const search = filters.search?.trim().toLowerCase() ?? "";
    const tab = filters.tab ?? "all";

    const cancelledCutoff = new Date(now.getTime() - CANCELLED_WINDOW_DAYS * 24 * 60 * 60_000);
    const futureCutoff = new Date(now.getTime() + FUTURE_WINDOW_DAYS * 24 * 60 * 60_000);
    const doneCutoff = new Date(now.getTime() - FUTURE_WINDOW_DAYS * 24 * 60 * 60_000);

    // We pull both buckets in parallel: active (pending/confirmed/today/done)
    // and cancelled (separate window). The two ranges don't overlap by status
    // so we can union them in code without dedup logic.
    const [activeRows, cancelledRows] = await Promise.all([
      prisma.booking.findMany({
        where: {
          providerId: input.masterId,
          status: {
            notIn: [
              BookingStatus.CANCELLED,
              BookingStatus.REJECTED,
              BookingStatus.NO_SHOW,
            ],
          },
          OR: [
            { startAtUtc: { gte: doneCutoff, lt: futureCutoff } },
            { startAtUtc: null },
          ],
        },
        orderBy: { startAtUtc: "asc" },
        select: {
          id: true,
          status: true,
          startAtUtc: true,
          endAtUtc: true,
          clientName: true,
          clientUserId: true,
          changeComment: true,
          service: { select: { name: true, title: true, price: true } },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
      prisma.booking.findMany({
        where: {
          providerId: input.masterId,
          status: {
            in: [BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.NO_SHOW],
          },
          OR: [
            { cancelledAtUtc: { gte: cancelledCutoff } },
            { cancelledAtUtc: null, updatedAt: { gte: cancelledCutoff } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          startAtUtc: true,
          endAtUtc: true,
          clientName: true,
          clientUserId: true,
          changeComment: true,
          service: { select: { name: true, title: true, price: true } },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
    ]);

    const allRows = [...activeRows, ...cancelledRows];
    const clientUserIds = Array.from(
      new Set(allRows.map((r) => r.clientUserId).filter((id): id is string => Boolean(id))),
    );
    const bookingIds = allRows.map((r) => r.id);

    // Visit counts (one groupBy, not N+1) and review ratings (one batched
    // query by bookingId) — both run in parallel with the user metadata
    // lookup that fills in avatars for known clients.
    const [visitCountRows, reviewRows, clientUsers] = await Promise.all([
      clientUserIds.length > 0
        ? prisma.booking.groupBy({
            by: ["clientUserId"],
            where: {
              providerId: input.masterId,
              clientUserId: { in: clientUserIds },
              status: BookingStatus.FINISHED,
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      bookingIds.length > 0
        ? prisma.review.findMany({
            where: {
              bookingId: { in: bookingIds },
              targetType: ReviewTargetType.provider,
            },
            select: { bookingId: true, rating: true },
          })
        : Promise.resolve([]),
      clientUserIds.length > 0
        ? prisma.userProfile.findMany({
            where: { id: { in: clientUserIds } },
            select: { id: true, externalPhotoUrl: true },
          })
        : Promise.resolve([]),
    ]);

    const visitCountByClient = new Map<string, number>();
    for (const row of visitCountRows) {
      if (row.clientUserId) visitCountByClient.set(row.clientUserId, row._count._all);
    }
    const reviewByBooking = new Map<string, number>();
    for (const row of reviewRows) {
      if (row.bookingId) reviewByBooking.set(row.bookingId, row.rating);
    }
    const avatarByClient = new Map<string, string | null>();
    for (const u of clientUsers) avatarByClient.set(u.id, u.externalPhotoUrl);

    const items: KanbanBookingItem[] = allRows.map((row) => {
      const runtime = resolveBookingRuntimeStatus({
        status: row.status,
        startAtUtc: row.startAtUtc,
        endAtUtc: row.endAtUtc,
        now,
      });
      const column: ColumnId = (() => {
        if (runtime === "REJECTED") return "cancelled";
        if (runtime === "FINISHED") return "done";
        if (runtime === "IN_PROGRESS") return "today";
        if (runtime === "PENDING" || runtime === "CHANGE_REQUESTED") return "pending";
        return "confirmed";
      })();

      const visitCount = row.clientUserId ? visitCountByClient.get(row.clientUserId) ?? 0 : 0;
      const isNewClient = visitCount === 0;
      const visitTag = row.clientUserId ? pluralizeVisit(visitCount) : null;
      const reviewRating = reviewByBooking.get(row.id) ?? null;
      const clientAvatarUrl = row.clientUserId ? avatarByClient.get(row.clientUserId) ?? null : null;

      return {
        id: row.id,
        column,
        rawStatus: row.status,
        clientName: row.clientName,
        clientUserId: row.clientUserId,
        clientAvatarUrl,
        visitTag,
        isNewClient,
        serviceTitle: row.service.title?.trim() || row.service.name,
        startAtUtc: row.startAtUtc,
        endAtUtc: row.endAtUtc,
        whenLabel: formatWhenLabel(row.startAtUtc, now),
        price: bookingPrice(row),
        changeComment: row.changeComment,
        reviewRating,
      };
    });

    // Tab filter (server-side so URL state controls everything).
    const tabFiltered = items.filter((item) => {
      if (tab === "new") return item.isNewClient;
      if (tab === "regular") {
        if (!item.clientUserId) return false;
        const visitCount = visitCountByClient.get(item.clientUserId) ?? 0;
        return visitCount >= 3;
      }
      return true;
    });

    // Search filter (client name OR service title, case-insensitive).
    const searchFiltered = search
      ? tabFiltered.filter(
          (item) =>
            item.clientName.toLowerCase().includes(search) ||
            item.serviceTitle.toLowerCase().includes(search),
        )
      : tabFiltered;

    const columns: Record<ColumnId, KanbanBookingItem[]> = {
      pending: [],
      confirmed: [],
      today: [],
      done: [],
      cancelled: [],
    };
    for (const item of searchFiltered) columns[item.column].push(item);

    // Done and cancelled — newest first; pending/confirmed/today already
    // sorted asc by startAtUtc from the query.
    columns.done.sort(
      (a, b) => (b.startAtUtc?.getTime() ?? 0) - (a.startAtUtc?.getTime() ?? 0),
    );

    const total = searchFiltered.length;
    const pendingSum = columns.pending.reduce((s, b) => s + b.price, 0);
    const confirmedSum =
      columns.confirmed.reduce((s, b) => s + b.price, 0) +
      columns.today.reduce((s, b) => s + b.price, 0);

    return {
      columns,
      stats: { total, pendingSum, confirmedSum },
    };
  },
);
