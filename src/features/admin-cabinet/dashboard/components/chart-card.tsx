"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminChartSeries } from "@/features/admin-cabinet/dashboard/types";

const T = UI_TEXT.adminPanel.dashboard.charts;

type Props = {
  title: string;
  deltaSuffix: string;
  data: AdminChartSeries;
  variant: "bars" | "line";
  /** "Регистраций" / "Записей" — used inside the hover tooltip. */
  tooltipNoun: string;
  ariaLabel: string;
};

const VIEW_W = 720;
const VIEW_H = 200;
const PAD_X = 24;
const PAD_Y = 24;

const COUNT_FMT = new Intl.NumberFormat("ru-RU");

/** Shared chart primitive. Pure SVG — `stroke="currentColor"` / fills
 * via `text-*` tokens — so the colour automatically tracks the brand
 * palette in both themes without per-theme stylesheets. Recharts is
 * not in the dependency tree; inline SVG is enough for two 7-point
 * series and avoids shipping ~50 kB of chart library to admins. */
export function ChartCard({
  title,
  deltaSuffix,
  data,
  variant,
  tooltipNoun,
  ariaLabel,
}: Props) {
  const max = Math.max(...data.points.map((p) => p.count), 1);
  const stepX =
    data.points.length > 1
      ? (VIEW_W - PAD_X * 2) / (data.points.length - 1)
      : 0;
  const toY = (v: number) =>
    VIEW_H - PAD_Y - (v / max) * (VIEW_H - PAD_Y * 2 - 8);

  // Path strings recomputed on every render — 7 points is cheap and
  // React Compiler memoises automatically where it helps.
  const linePath = data.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${PAD_X + i * stepX} ${toY(p.count)}`)
    .join(" ");

  const areaPath =
    data.points.length === 0
      ? ""
      : [
          `M${PAD_X} ${VIEW_H - PAD_Y}`,
          ...data.points.map(
            (p, i) => `L${PAD_X + i * stepX} ${toY(p.count)}`,
          ),
          `L${PAD_X + (data.points.length - 1) * stepX} ${VIEW_H - PAD_Y}`,
          "Z",
        ].join(" ");

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="font-display text-base font-semibold text-text-main">
          {title}
        </h3>
        <DeltaText data={data} suffix={deltaSuffix} />
      </header>

      <div className="mb-2 flex items-baseline gap-3">
        <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-text-main">
          {COUNT_FMT.format(data.total)}
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H + 24}`}
          role="img"
          aria-label={ariaLabel}
          className="w-full overflow-visible"
        >
          {/* Dashed grid lines at 25/50/75% of the chart area. */}
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={PAD_X}
              y1={PAD_Y + t * (VIEW_H - PAD_Y * 2)}
              x2={VIEW_W - PAD_X}
              y2={PAD_Y + t * (VIEW_H - PAD_Y * 2)}
              className="stroke-border-subtle"
              strokeDasharray="3 4"
            />
          ))}

          {variant === "bars" ? (
            <g className="fill-primary">
              {data.points.map((p, i) => {
                const x = PAD_X + i * stepX - 14;
                const h = (p.count / max) * (VIEW_H - PAD_Y * 2 - 8);
                return (
                  <rect
                    key={p.date}
                    x={x}
                    y={VIEW_H - PAD_Y - h}
                    width={28}
                    height={h || 1}
                    rx={4}
                    className={cn(
                      "transition-opacity",
                      hoverIdx !== null && hoverIdx !== i ? "opacity-60" : "opacity-100",
                    )}
                  />
                );
              })}
            </g>
          ) : (
            <>
              <path d={areaPath} className="fill-primary/10" />
              <path
                d={linePath}
                className="stroke-primary"
                fill="none"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {data.points.map((p, i) => (
                <circle
                  key={p.date}
                  cx={PAD_X + i * stepX}
                  cy={toY(p.count)}
                  r={i === data.points.length - 1 ? 5 : 3}
                  className="fill-bg-card stroke-primary"
                  strokeWidth={2}
                />
              ))}
            </>
          )}

          {/* Invisible hover hot-spots — one per data point. */}
          {data.points.map((p, i) => (
            <rect
              key={`hit-${p.date}`}
              x={PAD_X + i * stepX - stepX / 2}
              y={0}
              width={stepX || VIEW_W}
              height={VIEW_H}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          ))}

          {/* X-axis labels. */}
          {data.points.map((p, i) => (
            <text
              key={`lbl-${p.date}`}
              x={PAD_X + i * stepX}
              y={VIEW_H + 16}
              textAnchor="middle"
              className="fill-text-sec font-mono text-[10px]"
            >
              {p.label}
            </text>
          ))}

          {/* Tooltip rendered as text inside SVG so it scales with the
              chart. Positioned just above the hovered point. */}
          {hoverIdx !== null && data.points[hoverIdx] ? (
            <g>
              <text
                x={PAD_X + hoverIdx * stepX}
                y={toY(data.points[hoverIdx]!.count) - 14}
                textAnchor="middle"
                className="fill-text-main font-mono text-[11px] font-semibold"
              >
                {tooltipNoun}: {COUNT_FMT.format(data.points[hoverIdx]!.count)}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
    </article>
  );
}

function DeltaText({
  data,
  suffix,
}: {
  data: AdminChartSeries;
  suffix: string;
}) {
  if (data.deltaText === null || data.deltaSign === null) {
    return (
      <span className="font-mono text-[11px] text-text-sec">
        {T.todayLabel}
      </span>
    );
  }
  const isPositive = data.deltaSign === "positive";
  const isZero = data.deltaSign === "zero";
  return (
    <span
      className={cn(
        "font-mono text-[11px] font-semibold",
        isZero
          ? "text-text-sec"
          : isPositive
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400",
      )}
    >
      {data.deltaText} {suffix}
    </span>
  );
}
