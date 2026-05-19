/**
 * STUDIO-ANALYTICS-A — types for the studio cabinet analytics page.
 *
 * Mirrors master `analytics-view.service.ts` shape so reuse of inline-
 * SVG chart patterns + KPI helpers stays trivial. Studio additions:
 *   - 4 view tabs (overview / masters / services / clients)
 *   - `byMaster` payload (studio-only `/api/analytics/revenue/by-master`)
 *   - inline BookingSource breakdown (no endpoint exposes this; the
 *     orchestrator computes it via a single Prisma groupBy)
 *
 * Excluded per spec:
 *   - commission/payout «ВАМ» column — STUDIO-SERVICES-A payouts deferred
 *   - cohort matrix UI — endpoint exists but deeper-analytics scope
 *     deferred to backlog
 *   - custom date picker — PREMIUM-gated proxy in master; backlogged
 *     for studio so the page ships with presets only
 *   - export — backlog
 */

export type StudioAnalyticsPeriodId = "7d" | "30d" | "90d" | "year";

export type StudioAnalyticsViewId = "overview" | "masters" | "services" | "clients";

export type StudioAnalyticsFeatureFlags = {
  /** KPI tiles + occupancy. FREE+. */
  dashboard: boolean;
  /** Revenue chart + by-master + by-service. PRO+. */
  revenue: boolean;
  /** Client segments + LTV + top clients. PRO+. */
  clients: boolean;
  /** Heatmap / funnel / lead-time. PREMIUM+. */
  bookingInsights: boolean;
  /** Cohort retention matrix. PREMIUM+. Currently surfaced as backlog
   *  placeholder in the clients view. */
  cohorts: boolean;
};

export type AnalyticsKpiMetric = {
  value: number;
  previous: number | null;
  /** -∞..+∞ — null when no previous data or previous=0 (cannot compute %). */
  deltaPct: number | null;
};

export type StudioAnalyticsKpi = {
  revenue: AnalyticsKpiMetric;
  bookings: AnalyticsKpiMetric;
  avgCheck: AnalyticsKpiMetric;
  /** 0..1 fractional. */
  occupancy: AnalyticsKpiMetric;
  /** 0..1 fractional (% of clients who returned in period). */
  returnRate: AnalyticsKpiMetric;
};

export type RevenuePoint = {
  /** Bucket key (YYYY-MM-DD). */
  label: string;
  current: number;
  /** kopeks, null when compare disabled. */
  previous: number | null;
};

export type RevenueSection = {
  totalCurrent: number;
  totalPrevious: number | null;
  deltaPct: number | null;
  granularity: "day" | "week" | "month";
  points: RevenuePoint[];
};

export type SourceSlice = {
  source: "WEB" | "MANUAL" | "APP";
  label: string;
  count: number;
  percent: number;
};

export type HeatmapCell = {
  weekday: number; // 0=Sun..6=Sat
  hour: number;
  count: number;
};

export type HeatmapSection = {
  cells: HeatmapCell[];
  maxCount: number;
};

export type MasterAnalyticsRow = {
  masterId: string;
  masterName: string;
  bookings: number;
  revenueKopeks: number;
  avgCheckKopeks: number;
  /** 0..1 fractional. Reuses dashboard occupancy proxy (5 slots/day) for
   *  consistency with STUDIO-DASHBOARD-A. */
  occupancyRate: number;
  rating: number;
  reviewsCount: number;
};

export type ServiceAnalyticsRow = {
  serviceKey: string;
  serviceName: string;
  bookings: number;
  revenueKopeks: number;
  /** 0..1 fractional — share of total period revenue. */
  share: number;
  /** Count of distinct masters who delivered the service in the period. */
  mastersCount: number;
};

export type TopClientRow = {
  clientKey: string;
  displayName: string;
  visitsCount: number;
  lifetimeKopeks: number;
};

export type ClientSegmentSlice = {
  key: "new" | "returning" | "loyal" | "sleeping" | "lost";
  label: string;
  count: number;
  percent: number;
};

export type StudioAnalyticsViewData = {
  period: StudioAnalyticsPeriodId;
  periodLabel: string;
  view: StudioAnalyticsViewId;
  compare: boolean;
  features: StudioAnalyticsFeatureFlags;
  kpi: StudioAnalyticsKpi;
  overview: {
    revenue: RevenueSection | null;
    sources: SourceSlice[];
    heatmap: HeatmapSection | null;
  } | null;
  masters: MasterAnalyticsRow[] | null;
  services: ServiceAnalyticsRow[] | null;
  clients: {
    segments: ClientSegmentSlice[];
    topClients: TopClientRow[];
  } | null;
};

export function isStudioAnalyticsPeriod(value: unknown): value is StudioAnalyticsPeriodId {
  return value === "7d" || value === "30d" || value === "90d" || value === "year";
}

export function isStudioAnalyticsView(value: unknown): value is StudioAnalyticsViewId {
  return value === "overview" || value === "masters" || value === "services" || value === "clients";
}
