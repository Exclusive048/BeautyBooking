import type { FunnelStep } from "@/lib/master/analytics-funnel";
import type {
  AnalyticsKpi,
  HeatmapSection as HeatmapSectionData,
  TopServiceItem,
} from "@/lib/master/analytics-view.service";

/**
 * Period-anchored insights engine for the master analytics page (30b).
 *
 * Distinct from `src/lib/advisor` (profile/setup guidance — "fill in
 * your portfolio"). Insights here observe **period numbers** and surface
 * findings the master should react to: empty slots, growing winners,
 * dropping retention, falling avg check, high cancellation.
 *
 * Each rule is a pure function over the aggregated DTO — no I/O. Hide-
 * when-not-triggered: empty array means the section disappears entirely.
 */

export type InsightVariant = "opportunity" | "positive" | "warning" | "recommendation";

export type InsightId =
  | "heatmap_gap"
  | "top_service_growing"
  | "retention_drop"
  | "avg_check_decline"
  | "cancellation_high";

export type Insight = {
  id: InsightId;
  variant: InsightVariant;
  /** Internal priority — higher first. UI sorts on render. */
  priority: number;
  title: string;
  body: string;
};

export type InsightsInput = {
  heatmap: HeatmapSectionData | null;
  topServices: TopServiceItem[] | null;
  prevTopServices: TopServiceItem[] | null;
  funnel: FunnelStep[] | null;
  prevFunnel: FunnelStep[] | null;
  kpi: AnalyticsKpi;
  /** Cancel rate of bookings created in period (0..1). Null when the
   * existing booking funnel wasn't fetched. */
  cancellationRate: number | null;
  /** Localised text fragments — keep raw labels in `UI_TEXT.cabinetMaster.
   * analytics.insights.rules.*` and pass them through. We don't import
   * the UI_TEXT module here to keep this pure & test-friendly. */
  text: InsightsText;
};

export type InsightsText = {
  rules: {
    heatmap_gap: { title: string; bodyTemplate: string };
    top_service_growing: { title: string; bodyTemplate: string };
    retention_drop: { title: string; bodyTemplate: string };
    avg_check_decline: { title: string; bodyTemplate: string };
    cancellation_high: { title: string; bodyTemplate: string };
  };
};

const TOP_SERVICE_GROWTH_THRESHOLD = 0.15; // +15%
const TOP_SERVICE_SHARE_THRESHOLD = 0.25; // 25% of total
const RETENTION_DROP_PP = 10; // -10pp from prev period
const AVG_CHECK_DECLINE_PCT = -0.05; // -5%
const CANCELLATION_RATE_THRESHOLD = 0.25; // 25%

export function detectMasterInsights(input: InsightsInput): Insight[] {
  const insights: Insight[] = [];

  const gap = detectHeatmapGap(input.heatmap);
  if (gap) {
    insights.push({
      id: "heatmap_gap",
      variant: "opportunity",
      priority: 80,
      title: input.text.rules.heatmap_gap.title,
      body: input.text.rules.heatmap_gap.bodyTemplate
        .replace("{weekday}", gap.weekdayLabel)
        .replace("{hour}", gap.hourLabel),
    });
  }

  const growing = detectTopServiceGrowth(input.topServices, input.prevTopServices);
  if (growing) {
    insights.push({
      id: "top_service_growing",
      variant: "positive",
      priority: 70,
      title: input.text.rules.top_service_growing.title,
      body: input.text.rules.top_service_growing.bodyTemplate
        .replace("{name}", growing.name)
        .replace("{share}", String(growing.sharePct))
        .replace("{growthPct}", String(growing.growthPct)),
    });
  }

  const retention = detectRetentionDrop(input.funnel, input.prevFunnel);
  if (retention) {
    insights.push({
      id: "retention_drop",
      variant: "warning",
      priority: 90,
      title: input.text.rules.retention_drop.title,
      body: input.text.rules.retention_drop.bodyTemplate
        .replace("{currentPct}", String(retention.currentPct))
        .replace("{prevPct}", String(retention.prevPct)),
    });
  }

  if (input.kpi.avgCheck.deltaPct !== null && input.kpi.avgCheck.deltaPct <= AVG_CHECK_DECLINE_PCT) {
    const declinePct = Math.abs(Math.round(input.kpi.avgCheck.deltaPct * 100));
    insights.push({
      id: "avg_check_decline",
      variant: "warning",
      priority: 60,
      title: input.text.rules.avg_check_decline.title,
      body: input.text.rules.avg_check_decline.bodyTemplate.replace(
        "{declinePct}",
        String(declinePct)
      ),
    });
  }

  if (input.cancellationRate !== null && input.cancellationRate >= CANCELLATION_RATE_THRESHOLD) {
    const cancelPct = Math.round(input.cancellationRate * 100);
    insights.push({
      id: "cancellation_high",
      variant: "warning",
      priority: 50,
      title: input.text.rules.cancellation_high.title,
      body: input.text.rules.cancellation_high.bodyTemplate.replace(
        "{cancelPct}",
        String(cancelPct)
      ),
    });
  }

  // Higher priority first; deterministic order between equal-priority
  // entries via id alphabetical fallback.
  insights.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return insights;
}

const WEEKDAY_FULL = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
];

function detectHeatmapGap(
  heatmap: HeatmapSectionData | null
): { weekdayLabel: string; hourLabel: string } | null {
  if (!heatmap) return null;
  // Reuse the aggregator's own gap detection — it already runs the
  // simple "empty cell with busy neighbours in working hours" rule and
  // attaches it to the heatmap DTO. Keeps a single source of truth so
  // the inline heatmap banner and the Insights card never diverge.
  if (!heatmap.insight) return null;
  return {
    weekdayLabel: heatmap.insight.weekdayLabel,
    hourLabel: heatmap.insight.hourLabel,
  };
}

function detectTopServiceGrowth(
  current: TopServiceItem[] | null,
  previous: TopServiceItem[] | null
): { name: string; sharePct: number; growthPct: number } | null {
  if (!current || current.length === 0 || !previous) return null;
  const top = current[0];
  if (!top || top.revenue <= 0) return null;
  const totalCurrent = current.reduce((sum, row) => sum + row.revenue, 0);
  if (totalCurrent <= 0) return null;
  const share = top.revenue / totalCurrent;
  if (share < TOP_SERVICE_SHARE_THRESHOLD) return null;
  const prev = previous.find((row) => row.key === top.key);
  if (!prev || prev.revenue <= 0) return null;
  const growth = (top.revenue - prev.revenue) / prev.revenue;
  if (growth < TOP_SERVICE_GROWTH_THRESHOLD) return null;
  return {
    name: top.label,
    sharePct: Math.round(share * 100),
    growthPct: Math.round(growth * 100),
  };
}

function detectRetentionDrop(
  current: FunnelStep[] | null,
  previous: FunnelStep[] | null
): { currentPct: number; prevPct: number } | null {
  if (!current || !previous) return null;
  const currentReturn = current.find((step) => step.id === "returned");
  const prevReturn = previous.find((step) => step.id === "returned");
  if (!currentReturn || !prevReturn) return null;
  // Interpret pctFromPrevious as the "вернулись/пришли" conversion.
  // Both sides must have a meaningful ratio; if either is null, the
  // comparison is meaningless and we skip the rule.
  if (currentReturn.pctFromPrevious === null || prevReturn.pctFromPrevious === null) {
    return null;
  }
  const drop = prevReturn.pctFromPrevious - currentReturn.pctFromPrevious;
  if (drop < RETENTION_DROP_PP) return null;
  return {
    currentPct: currentReturn.pctFromPrevious,
    prevPct: prevReturn.pctFromPrevious,
  };
}

export const __test = { WEEKDAY_FULL };
