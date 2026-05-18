import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { RevenueSection } from "../../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.overview;

type Props = {
  data: RevenueSection;
  compare: boolean;
};

const CHART_W = 720;
const CHART_H = 200;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 20;

/**
 * Inline-SVG revenue chart — same pattern as master's `revenue-section`
 * (no external chart lib). Renders the current period as a soft area +
 * line; the previous period (when compare is on) overlays as a dashed
 * line for direct visual delta.
 *
 * Uses the project's `--primary` token via class names + `currentColor`
 * so the chart stays in palette across light/dark themes.
 */
export function RevenueLineChart({ data, compare }: Props) {
  if (data.points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-text-sec">
        {T.noData}
      </div>
    );
  }

  const maxCurrent = Math.max(...data.points.map((p) => p.current), 1);
  const maxPrev = compare
    ? Math.max(...data.points.map((p) => p.previous ?? 0), 1)
    : 0;
  const max = Math.max(maxCurrent, maxPrev, 1);
  const innerW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const step = data.points.length > 1 ? innerW / (data.points.length - 1) : 0;

  const xy = (index: number, value: number) => {
    const x = PAD_LEFT + step * index;
    const y = PAD_TOP + (innerH - (value / max) * innerH);
    return [x, y] as const;
  };

  const currentLine = data.points
    .map((p, i) => {
      const [x, y] = xy(i, p.current);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  const currentArea = `${currentLine} L${PAD_LEFT + step * (data.points.length - 1)},${PAD_TOP + innerH} L${PAD_LEFT},${PAD_TOP + innerH} Z`;

  const prevLine = compare
    ? data.points
        .map((p, i) => {
          const [x, y] = xy(i, p.previous ?? 0);
          return `${i === 0 ? "M" : "L"}${x},${y}`;
        })
        .join(" ")
    : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-2xl font-bold font-display text-text-main">
            {UI_FMT.priceLabel(data.totalCurrent)}
          </p>
          {compare && data.totalPrevious !== null ? (
            <p className="text-xs text-text-sec">
              {T.wasTemplate.replace("{value}", UI_FMT.priceLabel(data.totalPrevious))}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-sec">
          <span className="inline-flex items-center gap-1">
            <span className="h-1 w-3 rounded-full bg-primary" aria-hidden />
            {T.legendNow}
          </span>
          {compare ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-3 border-t border-dashed border-text-sec" aria-hidden />
              {T.legendPrev}
            </span>
          ) : null}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-48 w-full text-primary"
        role="img"
        aria-label="Revenue timeline"
      >
        <path d={currentArea} className="fill-primary/10" />
        <path d={currentLine} className="fill-none stroke-primary stroke-[2]" />
        {compare && prevLine ? (
          <path d={prevLine} className="fill-none stroke-text-sec/70 stroke-[1.5] [stroke-dasharray:4_4]" />
        ) : null}
      </svg>
    </div>
  );
}
