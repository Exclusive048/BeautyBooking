import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import { SOURCE_RING, SOURCE_TONE } from "../../lib/source-mapping";
import type { SourceSlice } from "../../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.overview;

type Props = {
  sources: SourceSlice[];
};

const SIZE = 140;
const RADIUS = 50;
const CIRCUM = 2 * Math.PI * RADIUS;
const STROKE = 18;

/**
 * SVG donut chart. Slices render via `stroke-dasharray` + offset — same
 * trick as master cabinet status donuts. Only sources with `count > 0`
 * appear (no fake APP slice for studios that don't have an app yet).
 *
 * Per spec: only the 3 real `BookingSource` enum values are shown
 * («Каталог» / «Звонок» / «Приложение»), never fabricated
 * «Сарафан»/«Соцсети».
 */
export function SourcesDonut({ sources }: Props) {
  if (sources.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-sec">
        {T.noData}
      </div>
    );
  }

  const total = sources.reduce((sum, s) => sum + s.count, 0) || 1;
  // Compute cumulative arc offsets without mutation — keeps the
  // server-render pure (`no-reassign-after-render` lint).
  const lens = sources.map((s) => (s.count / total) * CIRCUM);
  const slices = sources.map((s, i) => {
    const offset = lens.slice(0, i).reduce((sum, l) => sum + l, 0);
    return { ...s, dash: `${lens[i]} ${CIRCUM - (lens[i] ?? 0)}`, offset: -offset };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-32 w-32 -rotate-90" role="img">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          className="fill-none stroke-bg-input"
          strokeWidth={STROKE}
        />
        {slices.map((s) => (
          <circle
            key={s.source}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            className={cn("fill-none", SOURCE_RING[s.source])}
            strokeWidth={STROKE}
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <ul className="space-y-1.5 text-xs">
        {sources.map((s) => (
          <li key={s.source} className="flex items-center gap-2">
            <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", SOURCE_TONE[s.source])} />
            <span className="text-text-main">{s.label}</span>
            <span className="font-mono text-text-sec tabular-nums">
              {s.count} · {s.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
