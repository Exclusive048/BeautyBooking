import { TrendingDown, TrendingUp } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import type { AnalyticsKpiMetric, StudioAnalyticsKpi } from "../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.kpi;

type Props = {
  kpi: StudioAnalyticsKpi;
  compare: boolean;
};

export function AnalyticsKpiBar({ kpi, compare }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiTile label={T.revenue} metric={kpi.revenue} compare={compare} kind="money" />
      <KpiTile label={T.bookings} metric={kpi.bookings} compare={compare} kind="number" />
      <KpiTile label={T.avgCheck} metric={kpi.avgCheck} compare={compare} kind="money" />
      <KpiTile label={T.occupancy} metric={kpi.occupancy} compare={compare} kind="percent" />
      <KpiTile label={T.retention} metric={kpi.returnRate} compare={compare} kind="percent" />
    </div>
  );
}

function KpiTile({
  label,
  metric,
  compare,
  kind,
}: {
  label: string;
  metric: AnalyticsKpiMetric;
  compare: boolean;
  kind: "money" | "number" | "percent";
}) {
  const value =
    kind === "money"
      ? UI_FMT.priceLabel(metric.value)
      : kind === "percent"
        ? `${Math.round(metric.value * 100)}%`
        : String(Math.round(metric.value));

  const showDelta = compare && metric.deltaPct !== null;
  const deltaPositive = showDelta && (metric.deltaPct ?? 0) >= 0;

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">{label}</p>
      <div className="mt-2 font-display text-xl font-bold tabular-nums text-text-main md:text-2xl">
        {value}
      </div>
      {showDelta ? (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[11px] font-medium",
            deltaPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
          )}
        >
          {deltaPositive ? (
            <TrendingUp className="h-3 w-3" aria-hidden />
          ) : (
            <TrendingDown className="h-3 w-3" aria-hidden />
          )}
          <span>
            {(deltaPositive ? "+" : "") + Math.round((metric.deltaPct ?? 0) * 100)}%
          </span>
        </div>
      ) : compare && metric.previous === null ? (
        <div className="mt-1 text-[11px] text-text-sec/70">{T.noPrev}</div>
      ) : null}
    </div>
  );
}
