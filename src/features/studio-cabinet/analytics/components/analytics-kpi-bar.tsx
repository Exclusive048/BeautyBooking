import { TrendingDown, TrendingUp } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
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
    <StatTileGrid columns={5}>
      <KpiTile label={T.revenue} metric={kpi.revenue} compare={compare} kind="money" />
      <KpiTile label={T.bookings} metric={kpi.bookings} compare={compare} kind="number" />
      <KpiTile label={T.avgCheck} metric={kpi.avgCheck} compare={compare} kind="money" />
      <KpiTile label={T.occupancy} metric={kpi.occupancy} compare={compare} kind="percent" />
      <KpiTile label={T.retention} metric={kpi.returnRate} compare={compare} kind="percent" />
    </StatTileGrid>
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

  // PWA-FIX-10 - оболочка общая (StatTile), тренд-строка приезжает слотом footer:
  // у неё своя семантика (проценты к прошлому периоду либо «нет данных»).
  // UI-26/27: цвет дельты - токенами, без dark:-вилок.
  return (
    <StatTile
      label={label}
      value={value}
      footer={
        showDelta ? (
          <div
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium",
              deltaPositive ? "text-success-text" : "text-danger-text",
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
          <div className="text-[11px] text-text-sec/70">{T.noPrev}</div>
        ) : null
      }
    />
  );
}
