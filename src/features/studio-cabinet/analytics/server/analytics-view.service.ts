import { BookingSource, BookingStatus, ProviderType } from "@prisma/client";
import {
  getBookingsHeatmap,
  getClientSegments,
  getDashboardKpi,
  getRevenueByMaster,
  getRevenueByService,
  getRevenueTimeline,
  resolveAnalyticsContext,
  resolveRangeWithCompare,
  type AnalyticsContext,
  type AnalyticsRange,
} from "@/features/analytics";
import {
  computePreviousRange,
  computeRollingRange,
  formatPeriodDisplay,
  type RollingRange,
} from "@/lib/master/analytics-period";
import { prisma } from "@/lib/prisma";
import { SOURCE_LABEL } from "../lib/source-mapping";
import type {
  AnalyticsKpiMetric,
  ClientSegmentSlice,
  HeatmapSection,
  MasterAnalyticsRow,
  RevenueSection,
  ServiceAnalyticsRow,
  SourceSlice,
  StudioAnalyticsFeatureFlags,
  StudioAnalyticsKpi,
  StudioAnalyticsPeriodId,
  StudioAnalyticsViewData,
  StudioAnalyticsViewId,
  TopClientRow,
} from "../lib/types";

/**
 * STUDIO-ANALYTICS-A — server orchestrator for `/cabinet/studio/analytics`.
 *
 * Mirrors `getMasterAnalyticsView` shape so the inline-SVG charts +
 * KPI patterns from master notif redesign port over with minimum
 * duplication. Per-view dispatch keeps each tab cheap — only the
 * endpoints actually rendered get called.
 *
 * Reuses 13 of the 15 `/api/analytics/*` domain helpers. The one
 * studio-exclusive endpoint (`/revenue/by-master`) is used in the
 * Masters tab. BookingSource breakdown has no endpoint exposure, so
 * it's computed inline via a single Prisma groupBy (small, deterministic).
 *
 * Plan gating: each section guards its data fetch with the matching
 * `features.*` flag from `getStudioAnalyticsFeatures`. The UI lifts a
 * `<FeatureGate>` overlay over sections whose flag is false — same
 * pattern as master analytics.
 */

const COMPLETED_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
];

const DAILY_CAPACITY = 5; // STUDIO-DASHBOARD-A proxy — same heuristic.

function pickGranularity(period: StudioAnalyticsPeriodId): "day" | "week" | "month" {
  if (period === "7d" || period === "30d") return "day";
  if (period === "90d") return "week";
  return "month";
}

function toKpi(metric: {
  value: number;
  delta: number;
  deltaPct: number | null;
}): AnalyticsKpiMetric {
  const previous =
    metric.deltaPct === null && metric.delta === 0 ? null : metric.value - metric.delta;
  return { value: metric.value, previous, deltaPct: metric.deltaPct };
}

function computeDeltaPct(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

async function loadOverview(input: {
  context: AnalyticsContext;
  currentRange: AnalyticsRange;
  prevRange: AnalyticsRange | null;
  granularity: "day" | "week" | "month";
  features: StudioAnalyticsFeatureFlags;
}): Promise<NonNullable<StudioAnalyticsViewData["overview"]>> {
  const { context, currentRange, prevRange, granularity, features } = input;

  let revenue: RevenueSection | null = null;
  if (features.revenue) {
    const [currentTimeline, previousTimeline] = await Promise.all([
      getRevenueTimeline({ context, range: currentRange, granularity }),
      prevRange
        ? getRevenueTimeline({ context, range: prevRange, granularity })
        : Promise.resolve(null),
    ]);
    const totalCurrent = currentTimeline.points.reduce((sum, p) => sum + p.revenue, 0);
    const totalPrevious = previousTimeline
      ? previousTimeline.points.reduce((sum, p) => sum + p.revenue, 0)
      : null;
    revenue = {
      totalCurrent,
      totalPrevious,
      deltaPct: computeDeltaPct(totalCurrent, totalPrevious),
      granularity: currentTimeline.granularity,
      points: currentTimeline.points.map((point, index) => ({
        label: point.date,
        current: point.revenue,
        previous: previousTimeline?.points[index]?.revenue ?? null,
      })),
    };
  }

  // BookingSource breakdown — single inline groupBy keeps the page
  // honest (only 3 enum values, not fabricated «Сарафан»/«Соцсети»).
  const sourceRows = await prisma.booking.groupBy({
    by: ["source"],
    where: {
      OR: [{ studioId: context.studioId ?? undefined }, { providerId: context.providerId }],
      startAtUtc: { gte: currentRange.fromUtc, lt: currentRange.toUtcExclusive },
      status: { in: COMPLETED_STATUSES },
    },
    _count: { _all: true },
  });
  const sourceTotal = sourceRows.reduce((sum, row) => sum + row._count._all, 0);
  const sources: SourceSlice[] = sourceRows
    .filter((row) => row._count._all > 0)
    .map((row) => ({
      source: row.source as BookingSource,
      label: SOURCE_LABEL[row.source as BookingSource] ?? String(row.source),
      count: row._count._all,
      percent: sourceTotal > 0 ? Math.round((row._count._all / sourceTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  let heatmap: HeatmapSection | null = null;
  if (features.bookingInsights) {
    const data = await getBookingsHeatmap({ context, range: currentRange });
    const cells = data.cells.map((cell) => ({
      weekday: cell.day,
      hour: cell.hour,
      count: cell.count,
    }));
    heatmap = {
      cells,
      maxCount: cells.reduce((max, cell) => Math.max(max, cell.count), 0),
    };
  }

  return { revenue, sources, heatmap };
}

async function loadMastersView(input: {
  studioId: string;
  studioProviderId: string;
  context: AnalyticsContext;
  currentRange: AnalyticsRange;
  features: StudioAnalyticsFeatureFlags;
}): Promise<MasterAnalyticsRow[] | null> {
  if (!input.features.revenue) return null;
  const { studioId, studioProviderId, context, currentRange } = input;
  const [revenueByMaster, masters, bookingsCount] = await Promise.all([
    getRevenueByMaster({ context, range: currentRange }),
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: studioProviderId },
      select: { id: true, name: true, ratingAvg: true, ratingCount: true },
      orderBy: { name: "asc" },
    }),
    prisma.booking.groupBy({
      by: ["masterProviderId"],
      where: {
        OR: [{ studioId }, { providerId: studioProviderId }],
        startAtUtc: { gte: currentRange.fromUtc, lt: currentRange.toUtcExclusive },
        masterProviderId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const revenueByMasterMap = new Map(
    revenueByMaster.rows.map((row) => [row.masterId, row]),
  );
  const bookingsCountMap = new Map(
    bookingsCount
      .filter((row): row is typeof row & { masterProviderId: string } => Boolean(row.masterProviderId))
      .map((row) => [row.masterProviderId, row._count._all]),
  );

  const periodDays = Math.max(
    1,
    Math.round((currentRange.toUtcExclusive.getTime() - currentRange.fromUtc.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const capacity = periodDays * DAILY_CAPACITY;

  const rows: MasterAnalyticsRow[] = masters.map((master) => {
    const rev = revenueByMasterMap.get(master.id);
    const bookings = rev?.bookings ?? bookingsCountMap.get(master.id) ?? 0;
    const revenueKopeks = rev?.revenue ?? 0;
    return {
      masterId: master.id,
      masterName: master.name,
      bookings,
      revenueKopeks,
      avgCheckKopeks: bookings > 0 ? Math.round(revenueKopeks / bookings) : 0,
      occupancyRate: Math.min(1, bookings / capacity),
      rating: master.ratingAvg ?? 0,
      reviewsCount: master.ratingCount ?? 0,
    };
  });

  rows.sort((a, b) => b.revenueKopeks - a.revenueKopeks);
  return rows;
}

async function loadServicesView(input: {
  context: AnalyticsContext;
  currentRange: AnalyticsRange;
  features: StudioAnalyticsFeatureFlags;
}): Promise<ServiceAnalyticsRow[] | null> {
  if (!input.features.revenue) return null;
  const byService = await getRevenueByService({ context: input.context, range: input.currentRange });
  const total = byService.totalRevenue;
  // Distinct master counts per service — inline groupBy so we don't
  // need a new endpoint just for this column.
  const serviceMasters = await prisma.booking.findMany({
    where: {
      OR: [{ studioId: input.context.studioId ?? undefined }, { providerId: input.context.providerId }],
      startAtUtc: { gte: input.currentRange.fromUtc, lt: input.currentRange.toUtcExclusive },
    },
    select: { serviceId: true, masterProviderId: true },
  });
  const mastersPerService = new Map<string, Set<string>>();
  for (const row of serviceMasters) {
    if (!row.serviceId || !row.masterProviderId) continue;
    let set = mastersPerService.get(row.serviceId);
    if (!set) {
      set = new Set();
      mastersPerService.set(row.serviceId, set);
    }
    set.add(row.masterProviderId);
  }

  return byService.rows.map((row) => ({
    serviceKey: row.key,
    serviceName: row.label,
    bookings: row.bookings,
    revenueKopeks: row.revenue,
    share: total > 0 ? row.revenue / total : 0,
    mastersCount: mastersPerService.get(row.key)?.size ?? 0,
  }));
}

async function loadClientsView(input: {
  context: AnalyticsContext;
  currentRange: AnalyticsRange;
  features: StudioAnalyticsFeatureFlags;
}): Promise<StudioAnalyticsViewData["clients"] | null> {
  if (!input.features.clients) return null;
  const segmentsData = await getClientSegments({
    context: input.context,
    range: input.currentRange,
  });
  const totalSegments =
    segmentsData.segments.new +
    segmentsData.segments.returning +
    segmentsData.segments.loyal +
    segmentsData.segments.sleeping +
    segmentsData.segments.lost;

  const segments: ClientSegmentSlice[] = (
    [
      { key: "new" as const, label: "Новые", count: segmentsData.segments.new },
      { key: "returning" as const, label: "Возвращающиеся", count: segmentsData.segments.returning },
      { key: "loyal" as const, label: "Постоянные", count: segmentsData.segments.loyal },
      { key: "sleeping" as const, label: "Засыпающие", count: segmentsData.segments.sleeping },
      { key: "lost" as const, label: "Потерянные", count: segmentsData.segments.lost },
    ]
  ).map((slice) => ({
    ...slice,
    percent: totalSegments > 0 ? Math.round((slice.count / totalSegments) * 100) : 0,
  }));

  // `getClientSegments` returns top clients keyed by `clientUserId`
  // (no display name). Resolve names from UserProfile via single batch
  // query — N+1-safe.
  const topRaw = (segmentsData.topClients ?? []).slice(0, 10);
  const ids = topRaw.map((row) => row.clientId);
  const profiles =
    ids.length > 0
      ? await prisma.userProfile.findMany({
          where: { id: { in: ids } },
          select: { id: true, displayName: true, firstName: true, lastName: true },
        })
      : [];
  const nameById = new Map(
    profiles.map((p) => [
      p.id,
      p.displayName?.trim() ||
        `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() ||
        "Клиент",
    ]),
  );

  const topClients: TopClientRow[] = topRaw.map((row) => ({
    clientKey: row.clientId,
    displayName: nameById.get(row.clientId) ?? "Клиент",
    visitsCount: row.visits,
    lifetimeKopeks: row.revenue,
  }));

  return { segments, topClients };
}

export type LoadStudioAnalyticsInput = {
  userId: string;
  period: StudioAnalyticsPeriodId;
  view: StudioAnalyticsViewId;
  compare: boolean;
  features: StudioAnalyticsFeatureFlags;
};

export async function loadStudioAnalyticsView(
  input: LoadStudioAnalyticsInput,
): Promise<StudioAnalyticsViewData> {
  const context = await resolveAnalyticsContext({ userId: input.userId, scope: "STUDIO" });

  const range: RollingRange = computeRollingRange(input.period, context.timeZone);
  const prevRollingRange = input.compare ? computePreviousRange(range) : null;
  const { range: currentRange, prevRange } = resolveRangeWithCompare({
    period: "custom",
    timeZone: context.timeZone,
    from: range.fromKey,
    to: range.toKey,
    compare: input.compare,
  });

  // KPI is rendered on every view (sticky top bar). Always fetched.
  const kpiResult = await getDashboardKpi({ context, range: currentRange, prevRange });
  const kpi: StudioAnalyticsKpi = {
    revenue: toKpi(kpiResult.kpi.revenue),
    bookings: toKpi(kpiResult.kpi.bookingsCount),
    avgCheck: toKpi(kpiResult.kpi.avgCheck),
    occupancy: toKpi(kpiResult.kpi.occupancyRate),
    returnRate: toKpi(kpiResult.kpi.returnRate),
  };

  const granularity = pickGranularity(input.period);

  // Per-view dispatch — only the active view's data is loaded. Tab
  // switches are cheap because the URL change triggers a fresh SSR with
  // a different `view` value.
  let overview: StudioAnalyticsViewData["overview"] = null;
  let masters: StudioAnalyticsViewData["masters"] = null;
  let services: StudioAnalyticsViewData["services"] = null;
  let clients: StudioAnalyticsViewData["clients"] = null;

  if (input.view === "overview") {
    overview = await loadOverview({
      context,
      currentRange,
      prevRange,
      granularity,
      features: input.features,
    });
  } else if (input.view === "masters" && context.studioId && context.studioProviderId) {
    masters = await loadMastersView({
      studioId: context.studioId,
      studioProviderId: context.studioProviderId,
      context,
      currentRange,
      features: input.features,
    });
  } else if (input.view === "services") {
    services = await loadServicesView({ context, currentRange, features: input.features });
  } else if (input.view === "clients") {
    clients = await loadClientsView({ context, currentRange, features: input.features });
  }

  // Suppress unused warning when prev range isn't needed for UI compose.
  void prevRollingRange;

  return {
    period: input.period,
    periodLabel: formatPeriodDisplay(range),
    view: input.view,
    compare: input.compare,
    features: input.features,
    kpi,
    overview,
    masters,
    services,
    clients,
  };
}
