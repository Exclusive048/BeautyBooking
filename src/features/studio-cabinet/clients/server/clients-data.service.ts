import { BookingStatus, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyProfileNames, groupBookings, type BookingClientRow } from "@/lib/crm/clients";
import { calculateDaysSinceLastVisit } from "@/lib/crm/clients";
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

/**
 * STUDIO-CLIENTS-A — single server entrypoint for the clients page.
 *
 * Strategy:
 *   1. Load every non-cancelled booking for the studio in one query,
 *      with `masterProviderId` selected (so we can compute "main master"
 *      + "visited N masters" per client). Mirrors existing
 *      `getStudioClients` query shape but extends the select.
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
  segment: StudioClientSegmentKey;
  search?: string;
  masterId?: string | "all";
  cursor?: string;
};

export async function loadStudioClientsData(input: LoadStudioClientsInput): Promise<StudioClientsData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: {
      id: true,
      providerId: true,
      provider: { select: { timezone: true } },
    },
  });
  if (!studio) {
    return emptyResult();
  }

  const [bookings, masters] = await Promise.all([
    prisma.booking.findMany({
      where: {
        OR: [{ studioId: studio.id }, { providerId: studio.providerId }],
        status: { notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
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
    const phone = booking.clientPhone?.trim() || booking.clientPhoneSnapshot?.trim() || "";
    const key = booking.clientUserId ? `user:${booking.clientUserId}` : phone ? `phone:${phone}` : null;
    if (!key) continue;
    let map = perClientMasterCount.get(key);
    if (!map) {
      map = new Map();
      perClientMasterCount.set(key, map);
    }
    map.set(masterId, (map.get(masterId) ?? 0) + 1);
  }

  const now = new Date();
  const monthAgo = new Date(now.getTime() - MONTH_MS);
  const tz = studio.provider.timezone;

  const allRows: StudioClientRow[] = Array.from(grouped.values()).map((c) => {
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

  const segmentCounts: StudioClientsSegmentCounts = {
    all: allRows.length,
    vip: allRows.filter((r) => r.primarySegment === "vip").length,
    regular: allRows.filter((r) => r.primarySegment === "regular").length,
    new: allRows.filter((r) => r.primarySegment === "new").length,
    sleeping: allRows.filter((r) => r.primarySegment === "sleeping").length,
  };

  // Filter pipeline: segment → master → search.
  const search = input.search?.trim().toLowerCase() ?? "";
  const masterFilter = input.masterId && input.masterId !== "all" ? input.masterId : null;

  const filtered = allRows.filter((row) => {
    if (!segmentMatches(row, input.segment)) return false;
    if (masterFilter && row.mainMaster?.id !== masterFilter) return false;
    if (search.length > 0) {
      const haystack = `${row.displayName} ${row.phone}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  // Sort filtered: VIP first (visual priority), then most-recent visit.
  filtered.sort((a, b) => {
    if (a.primarySegment === "vip" && b.primarySegment !== "vip") return -1;
    if (b.primarySegment === "vip" && a.primarySegment !== "vip") return 1;
    const aDate = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
    const bDate = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
    return bDate - aDate;
  });

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
  const kpis = computeKpis(allRows, monthAgo, now);

  return {
    items: slice,
    segmentCounts,
    kpis,
    filteredCount: filtered.length,
    totalCount: allRows.length,
    nextCursor,
    timezone: tz,
    masterOptions: masters.map((m) => ({
      id: m.id,
      displayName: m.name,
      avatarUrl: m.avatarUrl ?? null,
    })),
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

// Re-export for components — keep a single import surface.
export { formatDaysAgo };
