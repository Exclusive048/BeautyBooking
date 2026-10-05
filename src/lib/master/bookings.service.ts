import { BookingStatus, ReviewTargetType, type Prisma } from "@prisma/client";
import {
  BOOKING_WORK_CONTEXT_SELECT,
  resolveBookingWorkContext,
  shouldShowWorkContext,
  type BookingWorkContext,
} from "@/lib/bookings/work-context";
import { cache } from "react";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { prisma } from "@/lib/prisma";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import { parseClientKeyIdentity } from "@/lib/crm/card-service";
import { buildPhoneVariants } from "@/lib/crm/card-utils";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { getDayOfWeek, getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";
import type { MasterWorkProfiles } from "@/lib/master/access";

const DEFAULT_DISPLAY_TIMEZONE = "Europe/Moscow";

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
  /**
   * RESCHEDULE-CURRENT-TIME: запрошенное клиентом время (CHANGE_REQUESTED),
   * в той же форме, что `whenLabel`; `null`, когда переноса нет.
   */
  proposedWhenLabel: string | null;
  price: number;
  /** Cancellation comment / change request reason — surfaced under cancelled cards. */
  changeComment: string | null;
  /** When the booking has a published review, contains its rating; null otherwise. */
  reviewRating: number | null;
  /**
   * MASTER-BOOKING-UI-FIX-A: who must respond when CHANGE_REQUESTED.
   * Used by `<BookingManageActions>` to surface the «Ожидаем ответа»
   * guard to the initiator instead of an action button that the
   * backend would reject.
   */
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /** STUDIO-MASTER-PROFILES (этап 3): личная запись или запись студии. */
  workContext: BookingWorkContext;
};

export type KanbanFilters = {
  search?: string;
  /** "all" — no filter, "new" — клиенты без предыдущих visits, "regular" — 3+ visits. */
  tab?: "all" | "new" | "regular";
  /**
   * MASTER-CLIENTS-FIX-A #7а: optional client filter set by the «Вся
   * история» deep-link. Format: `user:<cuid>` (registered client) or
   * `phone:<phone>` (legacy/manual). Decoded server-side from the
   * signed token in the URL before reaching this service.
   */
  clientKey?: string;
};

export type KanbanData = {
  columns: Record<ColumnId, KanbanBookingItem[]>;
  /** STUDIO-MASTER-PROFILES (этап 3): показывать ли пометку «Личная / Студия». */
  showWorkContext: boolean;
  /** MOBILE-MASTER-C: пояс кабинета (салона), в котором собраны `whenLabel`. */
  timezone: string;
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

/**
 * Format "сб, 2 мая · 15:30" or "сегодня · 15:30" for booking cards.
 *
 * FIX-04 (QA-113): formats in the MASTER's own `timeZone` (self-view), not the
 * Node process TZ — so an Almaty master reads Almaty time on a UTC prod host.
 * The availability engine is untouched (it was already TZ-safe per QA-07); only
 * this display label's source TZ changes. Format/locale/24h style unchanged.
 */
function formatWhenLabel(date: Date | null, now: Date, timeZone: string): string {
  if (!date) return "—";
  const sameDay = toLocalDateKey(date, timeZone) === toLocalDateKey(now, timeZone);
  const { hour, minute } = getLocalTimeParts(date, timeZone);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  if (sameDay) return `сегодня · ${hh}:${mm}`;
  const [, mStr, dStr] = toLocalDateKey(date, timeZone).split("-");
  const weekday = WEEKDAYS_SHORT[getDayOfWeek(date, timeZone)] ?? "";
  const month = MONTHS_GENITIVE[Number(mStr) - 1] ?? "";
  return `${weekday}, ${Number(dStr)} ${month} · ${hh}:${mm}`;
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
  async (input: {
    masterId: string;
    filters?: KanbanFilters;
    /** STUDIO-MASTER-PROFILES (этап 4): записи всех рабочих профилей мастера. */
    workProfiles?: MasterWorkProfiles;
    now?: Date;
  }): Promise<KanbanData> => {
    const now = input.now ?? new Date();
    const filters = input.filters ?? {};
    const search = filters.search?.trim().toLowerCase() ?? "";
    const tab = filters.tab ?? "all";

    // MASTER-CLIENTS-FIX-A #7а: build the client filter once (if any),
    // reuse on both buckets. Token verification happens at the route
    // layer — by the time we're here, the key is trusted and scoped
    // to this master. Phone variants cover normalized + snapshot
    // formats so legacy bookings still match.
    const clientFilter: Prisma.BookingWhereInput | null = filters.clientKey
      ? (() => {
          const { identity } = parseClientKeyIdentity(filters.clientKey);
          if (identity.clientUserId) {
            return { clientUserId: identity.clientUserId };
          }
          const variants = identity.clientPhone
            ? buildPhoneVariants(identity.clientPhone)
            : [];
          return {
            OR: [
              { clientPhone: { in: variants } },
              { clientPhoneSnapshot: { in: variants } },
            ],
          };
        })()
      : null;

    const cancelledCutoff = new Date(now.getTime() - CANCELLED_WINDOW_DAYS * 24 * 60 * 60_000);
    const futureCutoff = new Date(now.getTime() + FUTURE_WINDOW_DAYS * 24 * 60 * 60_000);
    const doneCutoff = new Date(now.getTime() - FUTURE_WINDOW_DAYS * 24 * 60 * 60_000);

    // We pull both buckets in parallel: active (pending/confirmed/today/done)
    // and cancelled (separate window). The two ranges don't overlap by status
    // so we can union them in code without dedup logic.
    // PERF-24: таймзона кабинета зависит только от `input.masterId` и ничего не
    // ждёт от списков — читается тем же заходом, а не третьим round-trip'ом
    // после него.
    const [activeRows, cancelledRows, providerTz] = await Promise.all([
      prisma.booking.findMany({
        where: {
          // F1: shared performer predicate — a studio master's bookings are
          // keyed providerId=STUDIO + masterProviderId=master, which the old
          // `providerId: input.masterId` filter could never match. Wrapped in
          // AND because this query carries its own OR (the time window).
          AND: [
            masterPerformedBookingWhere(input.workProfiles?.allIds ?? input.masterId),
            ...(clientFilter ? [clientFilter] : []),
          ],
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
          proposedStartAt: true,
          clientName: true,
          clientUserId: true,
          changeComment: true,
          actionRequiredBy: true,
          service: { select: { name: true, title: true, price: true } },
          serviceItems: { select: { priceSnapshot: true } },
          ...BOOKING_WORK_CONTEXT_SELECT,
        },
      }),
      prisma.booking.findMany({
        where: {
          AND: [
            masterPerformedBookingWhere(input.workProfiles?.allIds ?? input.masterId),
            ...(clientFilter ? [clientFilter] : []),
          ],
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
          proposedStartAt: true,
          clientName: true,
          clientUserId: true,
          changeComment: true,
          actionRequiredBy: true,
          service: { select: { name: true, title: true, price: true } },
          serviceItems: { select: { priceSnapshot: true } },
          ...BOOKING_WORK_CONTEXT_SELECT,
        },
      }),
      // FIX-04 (QA-113): booking labels render in the master's own timezone.
      prisma.provider.findUnique({
        where: { id: input.masterId },
        select: { timezone: true, studioId: true },
      }),
    ]);

    const timeZone = providerTz?.timezone ?? DEFAULT_DISPLAY_TIMEZONE;

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
              ...masterPerformedBookingWhere(input.workProfiles?.allIds ?? input.masterId),
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
              ...ACTIVE_REVIEW_FILTER,
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
        whenLabel: formatWhenLabel(row.startAtUtc, now, timeZone),
        proposedWhenLabel:
          row.status === "CHANGE_REQUESTED" && row.proposedStartAt
            ? formatWhenLabel(row.proposedStartAt, now, timeZone)
            : null,
        price: bookingPrice(row),
        changeComment: row.changeComment,
        reviewRating,
        actionRequiredBy: row.actionRequiredBy ?? null,
        workContext: resolveBookingWorkContext(row),
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
      showWorkContext: shouldShowWorkContext({
        masterInStudio: input.workProfiles?.worksInStudio ?? Boolean(providerTz?.studioId),
        contexts: items.map((item) => item.workContext),
      }),
      timezone: timeZone,
      stats: { total, pendingSum, confirmedSum },
    };
  },
);
