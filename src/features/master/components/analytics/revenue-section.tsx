import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RevenueSection as RevenueSectionData } from "@/lib/master/analytics-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatPercent, formatRubles, formatRublesShort } from "./lib/format";

const T = UI_TEXT.cabinetMaster.analytics.revenue;

type Props = {
  data: RevenueSectionData | null;
  comparison: boolean;
};

const CHART_W = 1280;
const CHART_H = 240;
const PAD = 32;

/**
 * Revenue line chart card. Uses inline SVG so the bundle stays lean —
 * matches the convention from `features/analytics/ui/analytics-page.tsx`.
 *
 * The chart is two paths: a soft area gradient + line for the current
 * period, and a dashed line for the previous period when comparison is
 * on. The viewBox-scaled SVG renders sharp at any width.
 */
export function RevenueSection({ data, comparison }: Props) {
  if (!data || data.points.length === 0) {
    return (
      <section className="rounded-2xl border border-border-subtle bg-bg-card p-6">
        <h2 className="font-display text-lg text-text-main">{T.heading}</h2>
        <div className="mt-4 rounded-xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-8 text-center">
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-sec">{T.emptyBody}</p>
        </div>
      </section>
    );
  }

  const showComparison = comparison && data.points.some((p) => p.previous !== null);

  const maxValue = Math.max(
    1,
    ...data.points.map((point) =>
      Math.max(point.current, point.previous ?? 0)
    )
  );
  const stepX = data.points.length > 1 ? (CHART_W - PAD * 2) / (data.points.length - 1) : 0;

  const toPath = (key: "current" | "previous"): string => {
    const segments: string[] = [];
    let prevWasNull = true;
    data.points.forEach((point, index) => {
      const value = point[key];
      if (value === null) {
        prevWasNull = true;
        return;
      }
      const x = PAD + index * stepX;
      const y = CHART_H - PAD - (value / maxValue) * (CHART_H - PAD * 2);
      segments.push(`${prevWasNull ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
      prevWasNull = false;
    });
    return segments.join(" ");
  };

  const currentPath = toPath("current");
  const previousPath = showComparison ? toPath("previous") : "";
  const areaPath =
    currentPath && data.points.length > 1
      ? `${currentPath} L ${PAD + (data.points.length - 1) * stepX} ${CHART_H - PAD} L ${PAD} ${CHART_H - PAD} Z`
      : "";

  // Y-axis ticks at quartiles for the dashed gridlines.
  const tickFractions = [0.25, 0.5, 0.75, 1];

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-text-main">{T.heading}</h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-2xl text-text-main">
              {formatRubles(data.totalCurrent)}
            </span>
            {showComparison && data.totalPrevious !== null ? (
              <>
                <DeltaInline deltaPct={data.deltaPct} />
                <span className="text-sm text-text-sec">
                  {T.vsTemplate.replace("{value}", formatRubles(data.totalPrevious))}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <Legend showComparison={showComparison} />
      </header>

      <div className="mt-6 -mx-2">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          role="img"
          aria-label={T.heading}
          className="block h-[240px] w-full"
        >
          <defs>
            <linearGradient id="ma-revenue-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="text-primary [stop-color:currentColor]" stopOpacity="0.22" />
              <stop offset="100%" className="text-primary [stop-color:currentColor]" stopOpacity="0" />
            </linearGradient>
          </defs>
          {tickFractions.map((t) => {
            const y = CHART_H - PAD - t * (CHART_H - PAD * 2);
            return (
              <line
                key={t}
                x1={PAD}
                y1={y}
                x2={CHART_W - PAD}
                y2={y}
                className="stroke-border-subtle"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
            );
          })}
          {tickFractions.map((t) => {
            const y = CHART_H - PAD - t * (CHART_H - PAD * 2);
            return (
              <text
                key={`label-${t}`}
                x={CHART_W - PAD + 6}
                y={y + 3}
                className="fill-text-sec font-mono text-[10px]"
              >
                {formatRublesShort(maxValue * t)}
              </text>
            );
          })}
          {areaPath ? (
            <path d={areaPath} fill="url(#ma-revenue-area)" />
          ) : null}
          {previousPath ? (
            <path
              d={previousPath}
              fill="none"
              className="stroke-primary"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              strokeOpacity="0.5"
            />
          ) : null}
          {currentPath ? (
            <path
              d={currentPath}
              fill="none"
              className="stroke-primary"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
        </svg>
      </div>
    </section>
  );
}

function DeltaInline({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return null;
  const isPositive = deltaPct > 0;
  const isFlat = deltaPct === 0;
  const Icon = isFlat ? null : isPositive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs",
        isFlat && "text-text-sec",
        isPositive && !isFlat && "text-emerald-700 dark:text-emerald-300",
        !isPositive && !isFlat && "text-rose-700 dark:text-rose-300"
      )}
    >
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {formatPercent(deltaPct, { signed: true })}
    </span>
  );
}

function Legend({ showComparison }: { showComparison: boolean }) {
  return (
    <div className="flex items-center gap-4 text-xs text-text-sec">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded bg-primary" aria-hidden />
        {T.legendCurrent}
      </span>
      {showComparison ? (
        <span className="inline-flex items-center gap-1.5 opacity-70">
          <span
            className="h-0 w-4 border-t-[2px] border-dashed border-primary"
            aria-hidden
          />
          {T.legendPrevious}
        </span>
      ) : null}
    </div>
  );
}
