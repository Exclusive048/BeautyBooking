import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AnalyticsKpi } from "@/lib/master/analytics-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import {
  formatNumber,
  formatPercent,
  formatPercentPoints,
  formatRubles,
} from "./lib/format";

const T = UI_TEXT.cabinetMaster.analytics.kpi;

type Props = {
  kpi: AnalyticsKpi;
  comparison: boolean;
};

/**
 * Four KPI tiles. Trend line at the bottom is hidden when comparison is
 * off; when it's on but the previous period had no data we show an
 * em-dash and the "нет данных за прошлый период" hint.
 *
 * Загрузка (utilization) fraction → percentage points for its trend
 * delta. Other three use percent.
 */
export function AnalyticsKpiCards({ kpi, comparison }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        label={T.revenueLabel}
        value={formatRubles(kpi.revenue.current)}
        comparison={comparison}
        deltaPct={kpi.revenue.deltaPct}
        previousLabel={
          kpi.revenue.previous === null
            ? T.prevNoData
            : T.prevTemplate.replace("{value}", formatRubles(kpi.revenue.previous))
        }
        previousIsNull={kpi.revenue.previous === null}
      />
      <KpiTile
        label={T.bookingsLabel}
        value={formatNumber(kpi.bookings.current)}
        comparison={comparison}
        deltaPct={kpi.bookings.deltaPct}
        previousLabel={
          kpi.bookings.previous === null
            ? T.prevNoData
            : T.prevTemplate.replace("{value}", formatNumber(kpi.bookings.previous))
        }
        previousIsNull={kpi.bookings.previous === null}
      />
      <KpiTile
        label={T.avgCheckLabel}
        value={formatRubles(kpi.avgCheck.current)}
        comparison={comparison}
        deltaPct={kpi.avgCheck.deltaPct}
        previousLabel={
          kpi.avgCheck.previous === null
            ? T.prevNoData
            : T.prevTemplate.replace("{value}", formatRubles(kpi.avgCheck.previous))
        }
        previousIsNull={kpi.avgCheck.previous === null}
      />
      <KpiTile
        label={T.utilizationLabel}
        value={formatPercent(kpi.utilization.current)}
        comparison={comparison}
        // Utilization deltaPct is misleading for "% of capacity" — switch
        // to percentage-point diff (current − previous, both fractions).
        deltaPp={
          kpi.utilization.previous === null
            ? null
            : kpi.utilization.current - kpi.utilization.previous
        }
        previousLabel={
          kpi.utilization.previous === null
            ? T.prevNoData
            : T.prevTemplate.replace("{value}", formatPercent(kpi.utilization.previous))
        }
        previousIsNull={kpi.utilization.previous === null}
      />
    </div>
  );
}

type TileProps = {
  label: string;
  value: string;
  comparison: boolean;
  /** Fractional delta (e.g. 0.22 == +22%). Mutually exclusive with deltaPp. */
  deltaPct?: number | null;
  /** Percentage-point diff (e.g. 0.05 == +5 п.п.). Mutually exclusive with deltaPct. */
  deltaPp?: number | null;
  previousLabel: string;
  previousIsNull: boolean;
};

function KpiTile({
  label,
  value,
  comparison,
  deltaPct,
  deltaPp,
  previousLabel,
  previousIsNull,
}: TileProps) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-text-main">{value}</p>
      {comparison ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <TrendBadge deltaPct={deltaPct} deltaPp={deltaPp} previousIsNull={previousIsNull} />
          <span className="text-[11px] text-text-sec">{previousLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function TrendBadge({
  deltaPct,
  deltaPp,
  previousIsNull,
}: {
  deltaPct?: number | null;
  deltaPp?: number | null;
  previousIsNull: boolean;
}) {
  if (previousIsNull) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-sec">
        <Minus className="h-3 w-3" aria-hidden />
        —
      </span>
    );
  }
  const value = deltaPp !== undefined && deltaPp !== null ? deltaPp : deltaPct ?? null;
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-sec">
        <Minus className="h-3 w-3" aria-hidden />
        —
      </span>
    );
  }
  const isPositive = value > 0;
  const isFlat = value === 0;
  const Icon = isFlat ? Minus : isPositive ? ArrowUp : ArrowDown;
  const formatted =
    deltaPp !== undefined && deltaPp !== null
      ? formatPercentPoints(deltaPp, { signed: true })
      : formatPercent(deltaPct ?? null, { signed: true });
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px]",
        isFlat && "bg-bg-input text-text-sec",
        isPositive && !isFlat && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        !isPositive && !isFlat && "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {formatted}
    </span>
  );
}
