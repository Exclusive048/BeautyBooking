import { BookingStatus, PdAccessActorType, ProviderType } from "@prisma/client";
import { buildFilterFingerprint, recordPdAccess } from "@/lib/audit/pd-access";
import { prisma } from "@/lib/prisma";
import { applyProfileNames, groupBookings, resolveBookingClientKey, type BookingClientRow } from "@/lib/crm/clients";
import { calculateDaysSinceLastVisit } from "@/lib/crm/clients";
import {
  buildPhoneVariants,
  parseClientKeyOrThrow,
  resolveBookingAmount,
  resolveServiceTitle,
} from "@/lib/crm/card-utils";
import { crmClientsWindowStart } from "@/lib/crm/clients-window";
import { CLIENT_STATUS_THRESHOLDS } from "@/lib/master/clients-classifier";
import { classifyStudioClient, segmentMatches, selectPrimarySegment } from "../lib/derive-segment";
import type {
  StudioClientMasterChip,
  StudioClientRow,
  StudioClientSegmentKey,
  StudioClientsData,
  StudioClientsKpis,
  StudioClientsSegmentCounts,
} from "../lib/types";
import { formatDaysAgo } from "../lib/format";
import { paginateByOffset } from "@/lib/pagination/offset-cursor";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";

/**
 * STUDIO-CLIENTS-A — single server entrypoint for the clients page.
 *
 * Strategy:
 *   1. Load every non-cancelled booking for the studio in one query,
 *      with `masterProviderId` selected (so we can compute "main master"
 *      + "visited N masters" per client).
 *   2. Group by clientKey (reuse `groupBookings` from `src/lib/crm`).
 *   3. Walk the grouped map a second time to derive per-master booking
 *      counts (N+1-safe because all rows are already in memory).
 *   4. Classify each client via the master `classifyClient` (reuse —
 *      consistent with STUDIO-BOOKINGS-A VIP signal).
 *   5. Compute KPIs + segment counts from the full classified set
 *      BEFORE applying filters — so sidebar counts always reflect the
 *      whole base.
 *   6. Apply filters (segment / search / master) + cursor pagination.
 *
 * MOBILE-STUDIO-C: шаги 1–5 — `collectStudioClients`, общий для веба
 * (`loadStudioClientsData`, курсор-ключ) и приложения
 * (`loadStudioClientsPage`, курсор-смещение); след чтения ПДн пишет каждая.
 *
 * CRM privacy: the cabinet route gates on `ensureStudioRole([OWNER,
 * ADMIN])` so only owners/admins reach this service. The master-only
 * scope ("каждый мастер видит только своих") is enforced at the
 * /cabinet/master/clients surface, not here.
 */

const PAGE_LIMIT = 50;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

type StudioBookingRow = BookingClientRow & {
  masterProviderId: string | null;
};

export type LoadStudioClientsInput = {
  studioId: string;
  /** Кто читает — для следа массового чтения ПДн (`PdAccessLog`, RKN-FIX-10). */
  actorUserId: string;
  actorIp: string | null;
  segment: StudioClientSegmentKey;
  search?: string;
  masterId?: string | "all";
  cursor?: string;
};

/** Вся база студии в окне CRM — до фильтров (KPI и счётчики считаются по ней). */
type StudioClientsBase = {
  studioId: string;
  timezone: string;
  rows: StudioClientRow[];
  masterOptions: StudioClientMasterChip[];
};

async function collectStudioClients(studioId: string, now: Date): Promise<StudioClientsBase | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: {
      id: true,
      providerId: true,
      provider: { select: { timezone: true } },
    },
  });
  if (!studio) return null;

  const [bookings, masters] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...studioBookingsWhere(studio.id),
        status: { notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
        // PERF-06: окно на входе группировки (см. crm/clients-window.ts).
        // KPI и счётчики сегментов считаются из этого же оконного набора.
        startAtUtc: { gte: crmClientsWindowStart() },
      },
      select: {
        id: true,
        status: true,
        clientUserId: true,
        clientName: true,
        clientPhone: true,
        clientNameSnapshot: true,
        clientPhoneSnapshot: true,
        startAtUtc: true,
        createdAt: true,
        masterProviderId: true,
        service: { select: { name: true, title: true, price: true } },
        serviceItems: {
          select: { titleSnapshot: true, priceSnapshot: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ startAtUtc: "desc" }, { createdAt: "desc" }],
    }),
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: studio.providerId },
      select: { id: true, name: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const grouped = groupBookings(bookings as BookingClientRow[]);

  // Resolve display names from UserProfile for clients that have a user
  // account (snapshot names may be stale).
  const userIds = Array.from(
    new Set(Array.from(grouped.values()).map((c) => c.clientUserId).filter(Boolean)),
  ) as string[];
  if (userIds.length > 0) {
    const profiles = await prisma.userProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, firstName: true, lastName: true },
    });
    applyProfileNames(
      grouped,
      profiles.map((p) => ({
        id: p.id,
        displayName: p.displayName ?? (`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || null),
      })),
    );
  }

  // Per-client master tally — done in-memory, no extra queries.
  const masterById = new Map(masters.map((m) => [m.id, m]));
  const perClientMasterCount = new Map<string, Map<string, number>>();
  const studioOwnProviderId = studio.providerId;
  for (const booking of bookings as StudioBookingRow[]) {
    const masterId = booking.masterProviderId ?? null;
    // Exclude bookings tied to the studio's own provider as "master" —
    // those are studio-direct bookings without a specific master.
    if (!masterId || masterId === studioOwnProviderId) continue;
    // MOBILE-STUDIO-C: ключ — как у `groupBookings` (нормализованный телефон,
    // снимок важнее текущего). Раньше здесь был сырой телефон, и у гостей без
    // аккаунта ключ расходился со строкой списка: «у 0 мастеров», без
    // основного мастера и мимо фильтра по мастеру.
    const key = resolveBookingClientKey(booking);
    if (!key) continue;
    let map = perClientMasterCount.get(key);
    if (!map) {
      map = new Map();
      perClientMasterCount.set(key, map);
    }
    map.set(masterId, (map.get(masterId) ?? 0) + 1);
  }

  const tz = studio.provider.timezone;

  const rows: StudioClientRow[] = Array.from(grouped.values()).map((c) => {
    const statuses = classifyStudioClient(
      {
        visits: c.visitsCount,
        ltv: c.totalAmount,
        firstVisitAt: c.firstVisitAt,
        lastVisitAt: c.lastVisitAt,
      },
      now,
    );
    const primarySegment = selectPrimarySegment(statuses);
    const masterMap = perClientMasterCount.get(c.key);
    const mainMasterId = masterMap
      ? Array.from(masterMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
      : null;
    const mainMaster: StudioClientMasterChip | null = mainMasterId
      ? (() => {
          const m = masterById.get(mainMasterId);
          if (!m) return null;
          return { id: m.id, displayName: m.name, avatarUrl: m.avatarUrl ?? null };
        })()
      : null;
    return {
      key: c.key,
      clientUserId: c.clientUserId,
      displayName: c.displayName,
      phone: c.phone,
      visitsCount: c.visitsCount,
      mastersCount: masterMap?.size ?? 0,
      lifetimeKopeks: c.totalAmount,
      avgCheckKopeks: c.visitsCount > 0 ? Math.round(c.totalAmount / c.visitsCount) : 0,
      lastVisitAt: c.lastVisitAt?.toISOString() ?? null,
      lastVisitDaysAgo: calculateDaysSinceLastVisit(c.lastVisitAt, tz),
      mainMaster,
      segments: statuses.length > 0 ? (statuses as StudioClientRow["segments"]) : ["other"],
      primarySegment,
    };
  });

  return {
    studioId: studio.id,
    timezone: tz,
    rows,
    masterOptions: masters.map((m) => ({
      id: m.id,
      displayName: m.name,
      avatarUrl: m.avatarUrl ?? null,
    })),
  };
}

function countSegments(rows: StudioClientRow[]): StudioClientsSegmentCounts {
  return {
    all: rows.length,
    vip: rows.filter((r) => r.primarySegment === "vip").length,
    regular: rows.filter((r) => r.primarySegment === "regular").length,
    new: rows.filter((r) => r.primarySegment === "new").length,
    sleeping: rows.filter((r) => r.primarySegment === "sleeping").length,
  };
}

/** Фильтры (сегмент → мастер → поиск) и порядок: VIP сверху, затем по последнему визиту. */
function filterStudioClients(
  rows: StudioClientRow[],
  input: { segment: StudioClientSegmentKey; search: string; masterFilter: string | null },
): StudioClientRow[] {
  const filtered = rows.filter((row) => {
    if (!segmentMatches(row, input.segment)) return false;
    if (input.masterFilter && row.mainMaster?.id !== input.masterFilter) return false;
    if (input.search.length > 0) {
      const haystack = `${row.displayName} ${row.phone}`.toLowerCase();
      if (!haystack.includes(input.search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (a.primarySegment === "vip" && b.primarySegment !== "vip") return -1;
    if (b.primarySegment === "vip" && a.primarySegment !== "vip") return 1;
    const aDate = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
    const bDate = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
    return bDate - aDate;
  });
  return filtered;
}

export async function loadStudioClientsData(input: LoadStudioClientsInput): Promise<StudioClientsData> {
  const now = new Date();
  const base = await collectStudioClients(input.studioId, now);
  if (!base) {
    return emptyResult();
  }
  const allRows = base.rows;
  const segmentCounts = countSegments(allRows);

  const search = input.search?.trim().toLowerCase() ?? "";
  const masterFilter = input.masterId && input.masterId !== "all" ? input.masterId : null;
  const filtered = filterStudioClients(allRows, { segment: input.segment, search, masterFilter });

  // Cursor pagination — cursor is the key of the last-shown row.
  const cursorIndex = input.cursor ? filtered.findIndex((r) => r.key === input.cursor) : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const slice = filtered.slice(startIndex, startIndex + PAGE_LIMIT + 1);
  let nextCursor: string | null = null;
  if (slice.length > PAGE_LIMIT) {
    nextCursor = slice[PAGE_LIMIT - 1]!.key;
    slice.pop();
  }

  // KPIs derived from the full set, not the filtered slice.
  const kpis = computeKpis(allRows, new Date(now.getTime() - MONTH_MS), now);

  await recordPdAccess({
    surface: "studio.clients.list",
    actorType: PdAccessActorType.STUDIO,
    actorUserId: input.actorUserId,
    entityType: "ClientCard",
    rowCount: slice.length,
    filterFingerprint: buildFilterFingerprint(
      {
        segment: input.segment !== "all",
        q: Boolean(search),
        master: Boolean(masterFilter),
        cursor: Boolean(input.cursor),
      },
      { limit: PAGE_LIMIT },
    ),
    scopeStudioId: base.studioId,
    ipAddress: input.actorIp,
  });

  return {
    items: slice,
    segmentCounts,
    kpis,
    filteredCount: filtered.length,
    totalCount: allRows.length,
    nextCursor,
    timezone: base.timezone,
    masterOptions: base.masterOptions,
  };
}

export type LoadStudioClientsPageInput = Omit<LoadStudioClientsInput, "cursor"> & {
  offset: number;
  limit: number;
};

export type StudioClientsPage = Omit<StudioClientsData, "nextCursor" | "filteredCount"> & {
  /** Непрозрачный курсор смещения (`lib/pagination/offset-cursor`); `null` — последняя страница. */
  nextCursor: string | null;
  /** Сколько клиентов под фильтрами. */
  total: number;
};

/**
 * MOBILE-STUDIO-C (G6) — тот же список для приложения
 * (`GET /api/cabinet/studio/clients`): те же окно, сегменты, KPI, фильтры и
 * порядок, но страница по смещению (`paginateByOffset`) — курсор-ключ веба
 * (ключ последней строки) несёт телефон гостя, а приложению он не нужен. След
 * чтения — та же поверхность `studio.clients.list`, в форме фильтра —
 * `limit`/`offset`.
 */
export async function loadStudioClientsPage(input: LoadStudioClientsPageInput): Promise<StudioClientsPage> {
  const now = new Date();
  const base = await collectStudioClients(input.studioId, now);
  if (!base) {
    const empty = emptyResult();
    return {
      items: [],
      segmentCounts: empty.segmentCounts,
      kpis: empty.kpis,
      totalCount: 0,
      total: 0,
      nextCursor: null,
      timezone: empty.timezone,
      masterOptions: [],
    };
  }
  const allRows = base.rows;
  const search = input.search?.trim().toLowerCase() ?? "";
  const masterFilter = input.masterId && input.masterId !== "all" ? input.masterId : null;
  const filtered = filterStudioClients(allRows, { segment: input.segment, search, masterFilter });
  const page = paginateByOffset(filtered, input.offset, input.limit);

  await recordPdAccess({
    surface: "studio.clients.list",
    actorType: PdAccessActorType.STUDIO,
    actorUserId: input.actorUserId,
    entityType: "ClientCard",
    rowCount: page.items.length,
    filterFingerprint: buildFilterFingerprint(
      {
        segment: input.segment !== "all",
        q: Boolean(search),
        master: Boolean(masterFilter),
      },
      { limit: input.limit, offset: input.offset },
    ),
    scopeStudioId: base.studioId,
    ipAddress: input.actorIp,
  });

  return {
    items: page.items,
    segmentCounts: countSegments(allRows),
    kpis: computeKpis(allRows, new Date(now.getTime() - MONTH_MS), now),
    totalCount: allRows.length,
    total: page.total,
    nextCursor: page.nextCursor,
    timezone: base.timezone,
    masterOptions: base.masterOptions,
  };
}

function computeKpis(rows: StudioClientRow[], monthAgo: Date, now: Date): StudioClientsKpis {
  const total = rows.length;
  const totalRevenue = rows.reduce((sum, r) => sum + r.lifetimeKopeks, 0);
  const addedThisMonth = rows.filter((r) => {
    if (!r.lastVisitAt) return false;
    const first = new Date(r.lastVisitAt);
    // Proxy: client "added" if first visit (==lastVisit for fresh) within a month.
    // Without firstVisitAt at row level we approximate via "visits=1 within month".
    return r.visitsCount <= 1 && first.getTime() >= monthAgo.getTime();
  }).length;

  const active30d = rows.filter((r) => {
    if (!r.lastVisitAt) return false;
    return new Date(r.lastVisitAt).getTime() >= monthAgo.getTime();
  }).length;
  const active30dPercent = total > 0 ? Math.round((active30d / total) * 100) : 0;

  const completed = rows.filter((r) => r.visitsCount > 0);
  const avgLifetime =
    completed.length > 0
      ? Math.round(completed.reduce((sum, r) => sum + r.lifetimeKopeks, 0) / completed.length)
      : 0;

  const vipRows = rows.filter((r) => r.lifetimeKopeks >= CLIENT_STATUS_THRESHOLDS.VIP_LTV_KOPEKS);
  const vipRevenue = vipRows.reduce((sum, r) => sum + r.lifetimeKopeks, 0);
  const vipRevenuePercent = totalRevenue > 0 ? Math.round((vipRevenue / totalRevenue) * 100) : 0;

  const sleepingThresholdMs = CLIENT_STATUS_THRESHOLDS.SLEEPING_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const sleepingCount = rows.filter((r) => {
    if (r.visitsCount === 0 || !r.lastVisitAt) return false;
    return now.getTime() - new Date(r.lastVisitAt).getTime() > sleepingThresholdMs;
  }).length;

  return {
    total: { count: total, addedThisMonth },
    active30d: { count: active30d, percentOfBase: active30dPercent },
    avgLifetime: { kopeks: avgLifetime },
    vip: { count: vipRows.length, revenuePercent: vipRevenuePercent },
    sleeping: { count: sleepingCount },
  };
}

function emptyResult(): StudioClientsData {
  return {
    items: [],
    segmentCounts: { all: 0, vip: 0, regular: 0, new: 0, sleeping: 0 },
    kpis: {
      total: { count: 0, addedThisMonth: 0 },
      active30d: { count: 0, percentOfBase: 0 },
      avgLifetime: { kopeks: 0 },
      vip: { count: 0, revenuePercent: 0 },
      sleeping: { count: 0 },
    },
    filteredCount: 0,
    totalCount: 0,
    nextCursor: null,
    // No studio → platform-default tz fallback (matches Provider.timezone default).
    timezone: "Europe/Moscow",
    masterOptions: [],
  };
}

/** Мастер записи в карточке клиента: `null` — запись на саму студию или мастер уже не в студии. */
export type StudioClientDetailMaster = { id: string; displayName: string };

export type StudioClientDetail = {
  timezone: string;
  client: {
    key: string;
    clientUserId: string | null;
    displayName: string;
    /** Телефон клиента (последний из записей); у карточки — можно, в списке — тоже есть. */
    phone: string | null;
    segments: StudioClientRow["segments"];
    primarySegment: StudioClientRow["primarySegment"];
    visitsCount: number;
    lifetimeKopeks: number;
    avgCheckKopeks: number;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    lastVisitDaysAgo: number | null;
    mastersCount: number;
    mainMaster: StudioClientMasterChip | null;
  };
  nextBooking: {
    id: string;
    startAtUtc: string;
    status: BookingStatus;
    serviceName: string;
    master: StudioClientDetailMaster | null;
  } | null;
  /** Последние завершённые визиты (FINISHED), новые сверху. */
  recentVisits: Array<{
    bookingId: string;
    startAtUtc: string;
    serviceName: string;
    amountKopeks: number;
    master: StudioClientDetailMaster | null;
  }>;
};

const RECENT_VISITS_LIMIT = 3;

/** Статусы предстоящей записи — как у карточки клиента мастера. */
const UPCOMING_STATUSES: ReadonlySet<BookingStatus> = new Set([
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHANGE_REQUESTED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
]);

/**
 * MOBILE-STUDIO-C (G6) — карточка клиента студии для приложения
 * (`GET /api/cabinet/studio/clients/{clientKey}`), без тарифного гейта: сводка
 * (сегменты, визиты, LTV, основной мастер), ближайшая запись и последние
 * визиты. Заметки, теги и фото — PRO-карточка `/api/studio/clients/{key}/card`.
 *
 * Набор — тот же, что у списка: брони студии в окне CRM (24 месяца), без
 * отменённых, отклонённых и неявок, сгруппированные `groupBookings`; поэтому
 * цифры карточки совпадают со строкой списка. `null` — у студии нет такого
 * клиента (в окне).
 *
 * Чтение одного клиента, но след пишется (`studio.clients.detail`): ключ
 * телефонного клиента — номер, и перебор карточек по номерам — то же
 * перечисление базы, что и список.
 */
export async function loadStudioClientDetail(input: {
  studioId: string;
  actorUserId: string;
  actorIp: string | null;
  clientKey: string;
  now?: Date;
}): Promise<StudioClientDetail | null> {
  const now = input.now ?? new Date();
  const parsed = parseClientKeyOrThrow(input.clientKey);

  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true, provider: { select: { timezone: true } } },
  });
  if (!studio) return null;

  const phoneVariants = parsed.type === "phone" ? buildPhoneVariants(parsed.value) : [];
  const clientFilter =
    parsed.type === "user"
      ? { clientUserId: parsed.value }
      : {
          clientUserId: null,
          OR: [{ clientPhone: { in: phoneVariants } }, { clientPhoneSnapshot: { in: phoneVariants } }],
        };

  const rows = (await prisma.booking.findMany({
    where: {
      AND: [
        studioBookingsWhere(studio.id),
        { status: { notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW] } },
        // PERF-06: то же окно, что у списка, — карточка не показывает больше строки.
        { startAtUtc: { gte: crmClientsWindowStart(now) } },
        clientFilter,
      ],
    },
    select: {
      id: true,
      status: true,
      clientUserId: true,
      clientName: true,
      clientPhone: true,
      clientNameSnapshot: true,
      clientPhoneSnapshot: true,
      startAtUtc: true,
      createdAt: true,
      masterProviderId: true,
      service: { select: { name: true, title: true, price: true } },
      serviceItems: {
        select: { titleSnapshot: true, priceSnapshot: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ startAtUtc: "desc" }, { createdAt: "desc" }],
  })) as StudioBookingRow[];

  // Фильтр по вариантам номера шире ключа (номер в одном поле, снимок — в
  // другом): оставляем ровно брони этого ключа, как их сгруппировал бы список.
  const bookings = rows.filter((booking) => resolveBookingClientKey(booking) === parsed.key);
  if (bookings.length === 0) return null;

  const grouped = groupBookings(bookings);
  const aggregate = grouped.get(parsed.key);
  if (!aggregate) return null;

  if (aggregate.clientUserId) {
    const profiles = await prisma.userProfile.findMany({
      where: { id: { in: [aggregate.clientUserId] } },
      select: { id: true, displayName: true, firstName: true, lastName: true },
    });
    applyProfileNames(
      grouped,
      profiles.map((p) => ({
        id: p.id,
        displayName: p.displayName ?? (`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || null),
      })),
    );
  }

  const masterVisits = new Map<string, number>();
  for (const booking of bookings) {
    const masterId = booking.masterProviderId;
    if (!masterId || masterId === studio.providerId) continue;
    masterVisits.set(masterId, (masterVisits.get(masterId) ?? 0) + 1);
  }
  const masters =
    masterVisits.size > 0
      ? await prisma.provider.findMany({
          where: { type: ProviderType.MASTER, studioId: studio.providerId, id: { in: [...masterVisits.keys()] } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : [];
  const masterById = new Map(masters.map((m) => [m.id, m]));
  const masterOf = (masterId: string | null): StudioClientDetailMaster | null => {
    const master = masterId ? masterById.get(masterId) : undefined;
    return master ? { id: master.id, displayName: master.name } : null;
  };
  const mainMasterId = [...masterVisits.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const mainMasterRow = mainMasterId ? masterById.get(mainMasterId) : undefined;

  const statuses = classifyStudioClient(
    {
      visits: aggregate.visitsCount,
      ltv: aggregate.totalAmount,
      firstVisitAt: aggregate.firstVisitAt,
      lastVisitAt: aggregate.lastVisitAt,
    },
    now,
  );

  const upcoming = bookings
    .filter((b) => UPCOMING_STATUSES.has(b.status) && b.startAtUtc && b.startAtUtc.getTime() > now.getTime())
    .sort((a, b) => a.startAtUtc!.getTime() - b.startAtUtc!.getTime())[0];

  const recentVisits = bookings
    .filter((b) => b.status === BookingStatus.FINISHED)
    .map((b) => ({ booking: b, at: b.startAtUtc ?? b.createdAt }))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, RECENT_VISITS_LIMIT)
    .map(({ booking, at }) => ({
      bookingId: booking.id,
      startAtUtc: at.toISOString(),
      serviceName: resolveServiceTitle(booking),
      amountKopeks: resolveBookingAmount(booking),
      master: masterOf(booking.masterProviderId),
    }));

  await recordPdAccess({
    surface: "studio.clients.detail",
    actorType: PdAccessActorType.STUDIO,
    actorUserId: input.actorUserId,
    entityType: "ClientCard",
    rowCount: 1,
    filterFingerprint: null,
    scopeStudioId: studio.id,
    ipAddress: input.actorIp,
  });

  const timezone = studio.provider.timezone;
  return {
    timezone,
    client: {
      key: aggregate.key,
      clientUserId: aggregate.clientUserId,
      displayName: aggregate.displayName,
      phone: aggregate.phone === "—" ? null : aggregate.phone,
      segments: statuses.length > 0 ? (statuses as StudioClientRow["segments"]) : ["other"],
      primarySegment: selectPrimarySegment(statuses),
      visitsCount: aggregate.visitsCount,
      lifetimeKopeks: aggregate.totalAmount,
      avgCheckKopeks: aggregate.visitsCount > 0 ? Math.round(aggregate.totalAmount / aggregate.visitsCount) : 0,
      firstVisitAt: aggregate.firstVisitAt?.toISOString() ?? null,
      lastVisitAt: aggregate.lastVisitAt?.toISOString() ?? null,
      lastVisitDaysAgo: calculateDaysSinceLastVisit(aggregate.lastVisitAt, timezone),
      mastersCount: masterVisits.size,
      mainMaster: mainMasterRow
        ? { id: mainMasterRow.id, displayName: mainMasterRow.name, avatarUrl: mainMasterRow.avatarUrl ?? null }
        : null,
    },
    nextBooking: upcoming
      ? {
          id: upcoming.id,
          startAtUtc: upcoming.startAtUtc!.toISOString(),
          status: upcoming.status,
          serviceName: resolveServiceTitle(upcoming),
          master: masterOf(upcoming.masterProviderId),
        }
      : null,
    recentVisits,
  };
}

// Re-export for components — keep a single import surface.
export { formatDaysAgo };
