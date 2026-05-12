import {
  getBookingsFunnel,
  getBookingsHeatmap,
  getDashboardKpi,
  getRevenueByService,
  getRevenueTimeline,
  resolveAnalyticsContext,
  resolveRangeWithCompare,
  type AnalyticsContext,
} from "@/features/analytics";
import { computeMasterFunnel, type FunnelStep } from "@/lib/master/analytics-funnel";
import {
  detectMasterInsights,
  type Insight,
  type InsightsText,
} from "@/lib/master/analytics-insights";
import {
  computePreviousRange,
  computeRollingRange,
  formatPeriodDisplay,
  type MasterAnalyticsPeriodId,
  type RollingRange,
} from "@/lib/master/analytics-period";
import type { MasterAnalyticsFeatureFlags } from "@/lib/master/analytics-features";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * Server-side aggregator for `/cabinet/master/analytics` (30a).
 *
 * Orchestrates the existing `/api/analytics/*` domain helpers into a
 * single round-trip — the page is RSC, so this runs once on the server
 * and the client only deals with chips / toggle islands. Sections that
 * are gated by the master's plan are skipped (returned as `null`); the
 * UI layer lifts the lock card over them.
 *
 * Comparison overlay: when enabled, we call `getRevenueTimeline` twice
 * (current + previous range) and merge into one zip-by-index series for
 * the line chart. KPIs already support comparison via `getDashboardKpi`'s
 * `prevRange` parameter, so no second call there.
 */

export type AnalyticsKpiTrend = {
  current: number;
  previous: number | null;
  /** -∞..+∞ — null when previous is null or zero (cannot compute %). */
  deltaPct: number | null;
};

export type AnalyticsKpi = {
  revenue: AnalyticsKpiTrend;
  bookings: AnalyticsKpiTrend;
  avgCheck: AnalyticsKpiTrend;
  utilization: AnalyticsKpiTrend;
};

export type RevenuePoint = {
  /** Bucket key (YYYY-MM-DD for daily, YYYY-MM-DD of monday for weekly). */
  label: string;
  /** kopeks */
  current: number;
  /** kopeks — null when comparison disabled or no matching prev bucket. */
  previous: number | null;
};

export type RevenueSection = {
  totalCurrent: number;
  totalPrevious: number | null;
  deltaPct: number | null;
  granularity: "day" | "week" | "month";
  points: RevenuePoint[];
};

export type TopServiceItem = {
  key: string;
  label: string;
  /** kopeks */
  revenue: number;
  bookings: number;
};

export type HeatmapCell = {
  weekday: number; // 0=Sunday … 6=Saturday (matches Postgres EXTRACT(DOW))
  hour: number;
  count: number;
};

export type HeatmapSection = {
  cells: HeatmapCell[];
  /** Highest count in the dataset — UI normalizes against this for the
   * "0%–100%" relative-intensity scale. Null when there are no cells. */
  maxCount: number;
  insight:
    | {
        weekdayLabel: string;
        hourLabel: string;
      }
    | null;
};

export type MasterAnalyticsViewData = {
  periodDisplay: string;
  comparisonEnabled: boolean;
  features: MasterAnalyticsFeatureFlags;
  range: RollingRange;
  prevRange: RollingRange | null;
  kpi: AnalyticsKpi;
  revenue: RevenueSection | null;
  topServices: TopServiceItem[] | null;
  heatmap: HeatmapSection | null;
  /** Client-cohort funnel (30b). Gated by `features.revenue`. */
  funnel: FunnelStep[] | null;
  /** Period-anchored observations (30b). Empty array when no rule is
   * triggered — the UI hides the section completely in that case. */
  insights: Insight[];
};

const HOUR_LABEL = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const WEEKDAY_LABEL = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEKDAY_LABEL_FULL = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
];

export async function getMasterAnalyticsView(input: {
  userId: string;
  period: MasterAnalyticsPeriodId;
  /** Required when `period === "custom"`. Inclusive [fromKey, toKey]. */
  customRange?: { fromKey: string; toKey: string } | null;
  comparison: boolean;
  features: MasterAnalyticsFeatureFlags;
}): Promise<MasterAnalyticsViewData> {
  const context = await resolveAnalyticsContext({
    userId: input.userId,
    scope: "MASTER",
  });

  // fix-02: custom period uses caller-supplied range; presets continue
  // to use the rolling helper. Granularity adapts to range length so
  // long custom ranges roll up to weeks/months automatically.
  const range =
    input.period === "custom" && input.customRange
      ? input.customRange
      : computeRollingRange(
          input.period === "custom" ? "30d" : input.period,
          context.timeZone,
        );
  const prevRange = input.comparison ? computePreviousRange(range) : null;

  const { range: currentRange, prevRange: prevAnalyticsRange } = resolveRangeWithCompare({
    period: "custom",
    timeZone: context.timeZone,
    from: range.fromKey,
    to: range.toKey,
    compare: input.comparison,
  });

  const granularity = pickGranularity(input.period, range);

  // KPI: existing helper handles current+previous in a single bookings
  // query when prevRange is provided.
  const kpiResult = await getDashboardKpi({
    context,
    range: currentRange,
    prevRange: prevAnalyticsRange,
  });

  // Revenue chart: timeline for current + (optional) previous range.
  let revenueSection: RevenueSection | null = null;
  if (input.features.revenue) {
    const [currentTimeline, previousTimeline] = await Promise.all([
      getRevenueTimeline({ context, range: currentRange, granularity }),
      prevAnalyticsRange
        ? getRevenueTimeline({ context, range: prevAnalyticsRange, granularity })
        : Promise.resolve(null),
    ]);

    const totalCurrent = currentTimeline.points.reduce((sum, p) => sum + p.revenue, 0);
    const totalPrevious = previousTimeline
      ? previousTimeline.points.reduce((sum, p) => sum + p.revenue, 0)
      : null;
    const deltaPct = computeDeltaPct(totalCurrent, totalPrevious);

    // Zip by index — current is the canonical x-axis, previous overlays
    // bucket-by-bucket. Periods are equal-length so indexes align.
    const points: RevenuePoint[] = currentTimeline.points.map((point, index) => ({
      label: point.date,
      current: point.revenue,
      previous: previousTimeline?.points[index]?.revenue ?? null,
    }));

    revenueSection = {
      totalCurrent,
      totalPrevious,
      deltaPct,
      granularity: currentTimeline.granularity,
      points,
    };
  }

  // Top services: feature-gated. Prev-period top services (when
  // comparison=on) feeds the "top service growing" insight rule.
  let topServices: TopServiceItem[] | null = null;
  let prevTopServices: TopServiceItem[] | null = null;
  if (input.features.revenue) {
    const [current, previous] = await Promise.all([
      getRevenueByService({ context, range: currentRange }),
      prevAnalyticsRange
        ? getRevenueByService({ context, range: prevAnalyticsRange })
        : Promise.resolve(null),
    ]);
    topServices = current.rows.slice(0, 6).map((row) => ({
      key: row.key,
      label: row.label,
      revenue: row.revenue,
      bookings: row.bookings,
    }));
    prevTopServices = previous
      ? previous.rows.map((row) => ({
          key: row.key,
          label: row.label,
          revenue: row.revenue,
          bookings: row.bookings,
        }))
      : null;
  }

  // Heatmap: feature-gated. Compute max + simple "low utilization"
  // insight (cells at zero in 10:00–20:00 working hours). The shared
  // helper uses `{ day, hour, count }` — we re-shape to `weekday` for
  // the master-cabinet DTO so UI naming reads as a calendar weekday.
  let heatmapSection: HeatmapSection | null = null;
  if (input.features.bookingInsights) {
    const heatmap = await getBookingsHeatmap({ context, range: currentRange });
    const cells: HeatmapCell[] = heatmap.cells.map((cell) => ({
      weekday: cell.day,
      hour: cell.hour,
      count: cell.count,
    }));
    const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0);
    heatmapSection = {
      cells,
      maxCount,
      insight: detectIdleSlotInsight(cells),
    };
  }

  // Funnel + prev funnel (30b). Gated by `features.revenue`; prev-funnel
  // only when comparison is on.
  let funnel: FunnelStep[] | null = null;
  let prevFunnel: FunnelStep[] | null = null;
  if (input.features.revenue) {
    const [current, previous] = await Promise.all([
      computeMasterFunnel({
        context,
        fromUtc: currentRange.fromUtc,
        toUtcExclusive: currentRange.toUtcExclusive,
      }),
      prevAnalyticsRange
        ? computeMasterFunnel({
            context,
            fromUtc: prevAnalyticsRange.fromUtc,
            toUtcExclusive: prevAnalyticsRange.toUtcExclusive,
          })
        : Promise.resolve(null),
    ]);
    funnel = current;
    prevFunnel = previous;
  }

  // Booking funnel (status-based) just for the cancellation-rate input
  // to the insights engine. The shared helper already does this in one
  // groupBy; we don't surface anything else from it.
  let cancellationRate: number | null = null;
  if (input.features.bookingInsights) {
    const bookingFunnel = await getBookingsFunnel({ context, range: currentRange });
    cancellationRate = bookingFunnel.cancelRate;
  }

  // Insights — pure computation over the aggregated DTO. Empty array
  // means the UI hides the section.
  const insights = input.features.bookingInsights
    ? detectMasterInsights({
        heatmap: heatmapSection,
        topServices,
        prevTopServices,
        funnel,
        prevFunnel,
        kpi: {
          revenue: kpiToTrend(kpiResult.kpi.revenue),
          bookings: kpiToTrend(kpiResult.kpi.bookingsCount),
          avgCheck: kpiToTrend(kpiResult.kpi.avgCheck),
          utilization: kpiToTrend(kpiResult.kpi.occupancyRate),
        },
        cancellationRate,
        text: buildInsightsText(),
      })
    : [];

  return {
    periodDisplay: formatPeriodDisplay(range),
    comparisonEnabled: input.comparison,
    features: input.features,
    range,
    prevRange,
    kpi: {
      revenue: kpiToTrend(kpiResult.kpi.revenue),
      bookings: kpiToTrend(kpiResult.kpi.bookingsCount),
      avgCheck: kpiToTrend(kpiResult.kpi.avgCheck),
      // occupancyRate is fractional (0..1) — UI multiplies by 100.
      utilization: kpiToTrend(kpiResult.kpi.occupancyRate),
    },
    revenue: revenueSection,
    topServices,
    heatmap: heatmapSection,
    funnel,
    insights,
  };
}

function buildInsightsText(): InsightsText {
  const T = UI_TEXT.cabinetMaster.analytics.insights.rules;
  return {
    rules: {
      heatmap_gap: { title: T.heatmap_gap_title, bodyTemplate: T.heatmap_gap_body },
      top_service_growing: {
        title: T.top_service_growing_title,
        bodyTemplate: T.top_service_growing_body,
      },
      retention_drop: { title: T.retention_drop_title, bodyTemplate: T.retention_drop_body },
      avg_check_decline: {
        title: T.avg_check_decline_title,
        bodyTemplate: T.avg_check_decline_body,
      },
      cancellation_high: {
        title: T.cancellation_high_title,
        bodyTemplate: T.cancellation_high_body,
      },
    },
  };
}

function pickGranularity(
  period: MasterAnalyticsPeriodId,
  range?: { fromKey: string; toKey: string },
): "day" | "week" | "month" {
  if (period === "custom" && range) {
    const days = diffInclusiveDaysQuick(range.fromKey, range.toKey);
    if (days <= 31) return "day";
    if (days <= 120) return "week";
    return "month";
  }
  if (period === "7d" || period === "30d") return "day";
  if (period === "90d") return "week";
  return "month";
}

function diffInclusiveDaysQuick(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00Z`);
  const to = new Date(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 30;
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

function kpiToTrend(metric: {
  value: number;
  delta: number;
  deltaPct: number | null;
}): AnalyticsKpiTrend {
  // The shared helper already gives us delta + deltaPct; previous is
  // value - delta. When deltaPct is null and delta is also 0, we read
  // it as "no previous data" → previous = null.
  const previous =
    metric.deltaPct === null && metric.delta === 0 ? null : metric.value - metric.delta;
  return {
    current: metric.value,
    previous,
    deltaPct: metric.deltaPct,
  };
}

function computeDeltaPct(current: number, previous: number | null): number | null {
  if (previous === null) return null;
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * 30a's only insight: find a (weekday, hour) cell that's empty during
 * working hours (10–20). Picks the first one in lexicographic weekday/
 * hour order — deterministic enough for demo and "the master's first
 * gap" is usually the most actionable. Full engine ships in 30b.
 */
function detectIdleSlotInsight(
  cells: HeatmapCell[]
): { weekdayLabel: string; hourLabel: string } | null {
  if (cells.length === 0) return null;
  const occupied = new Set<string>();
  for (const cell of cells) {
    if (cell.count > 0) occupied.add(`${cell.weekday}-${cell.hour}`);
  }
  for (let weekday = 1; weekday <= 6; weekday += 1) {
    // Iterate Mon–Sat first (weekend gaps less actionable), Sun last.
    for (let hour = 11; hour <= 17; hour += 1) {
      if (!occupied.has(`${weekday}-${hour}`)) {
        const sampleNeighbours = [
          `${weekday}-${hour - 1}`,
          `${weekday}-${hour + 1}`,
        ];
        // Only flag when surrounding hours are busy — otherwise it's
        // a closed window, not an idle slot.
        const someNeighbourBusy = sampleNeighbours.some((key) => occupied.has(key));
        if (someNeighbourBusy) {
          return {
            weekdayLabel: WEEKDAY_LABEL_FULL[weekday] ?? WEEKDAY_LABEL[weekday] ?? "",
            hourLabel: HOUR_LABEL(hour),
          };
        }
      }
    }
  }
  return null;
}

export type { AnalyticsContext };
