"use client";

import { useId, useMemo } from "react";
import type { CatalogPriceBucket } from "@/lib/catalog/catalog.service";

type Props = {
  /** Absolute min/max from the data set — slider domain. */
  min: number;
  max: number;
  /** Active range — `[low, high]` in same units as min/max. */
  value: [number, number];
  onChange: (value: [number, number]) => void;
  /** Server-supplied 15 buckets. When empty, histogram bars are skipped. */
  distribution: ReadonlyArray<CatalogPriceBucket>;
};

function formatRub(n: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} ₽`;
}

/**
 * Dual-thumb price range slider with a histogram backdrop.
 *
 * Histogram bars in the active range render with `bg-primary/55`; bars outside
 * use `bg-bg-muted/40` for a clear "unselected" affordance. The slider thumbs
 * are native `<input type="range">` overlaid on a custom track — clicks on the
 * histogram itself fall through to the underlying range inputs so the widget
 * behaves predictably with keyboard and pointer.
 */
export function HistogramSlider({ min, max, value, onChange, distribution }: Props) {
  const lowId = useId();
  const highId = useId();

  const [low, high] = value;
  const span = Math.max(1, max - min);
  const lowPct = ((low - min) / span) * 100;
  const highPct = ((high - min) / span) * 100;

  const maxCount = useMemo(
    () => distribution.reduce((m, b) => Math.max(m, b.count), 0),
    [distribution],
  );

  const handleLow = (raw: number) => {
    const next = Math.min(raw, high);
    onChange([Math.max(min, next), high]);
  };
  const handleHigh = (raw: number) => {
    const next = Math.max(raw, low);
    onChange([low, Math.min(max, next)]);
  };

  return (
    <div>
      {/* Numeric chips above the slider — tabular-nums for vertical alignment. */}
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-lg bg-muted/40 px-3 py-1.5 font-mono text-sm tabular-nums text-text-main">
          {formatRub(low)}
        </span>
        <span className="rounded-lg bg-muted/40 px-3 py-1.5 font-mono text-sm tabular-nums text-text-main">
          {formatRub(high)}
        </span>
      </div>

      {/* Histogram backdrop. Buckets are equal-width visual cells; in/out of
          range coloring matches the active slider thumbs. */}
      {distribution.length > 0 && maxCount > 0 ? (
        <div
          className="mb-3 flex h-8 items-end gap-px"
          aria-hidden
        >
          {distribution.map((bucket, i) => {
            const cellLeft = (i / distribution.length) * 100;
            const cellRight = ((i + 1) / distribution.length) * 100;
            const inRange = cellRight >= lowPct && cellLeft <= highPct;
            const heightPct = Math.max(8, Math.round((bucket.count / maxCount) * 100));
            return (
              <div
                key={i}
                className={
                  "flex-1 rounded-sm " +
                  (inRange ? "bg-primary/55" : "bg-muted/40")
                }
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>
      ) : null}

      {/* Slider track + dual thumbs. Range fill is a simple absolute div clipped
          by lowPct/highPct. Native range inputs sit on top — first one is
          pointer-events-auto only on its left half, the second on its right
          half, achieved by stacking with z-index.  */}
      <div className="relative h-1 rounded-full bg-muted">
        <div
          className="absolute h-full rounded-full bg-brand-gradient"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        <input
          id={lowId}
          aria-label="Минимальная цена"
          type="range"
          min={min}
          max={max}
          step={1}
          value={low}
          onChange={(e) => handleLow(Number(e.target.value))}
          className="histogram-slider-thumb pointer-events-none absolute -top-2 left-0 h-5 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
        />
        <input
          id={highId}
          aria-label="Максимальная цена"
          type="range"
          min={min}
          max={max}
          step={1}
          value={high}
          onChange={(e) => handleHigh(Number(e.target.value))}
          className="histogram-slider-thumb pointer-events-none absolute -top-2 left-0 h-5 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
        />
      </div>
    </div>
  );
}
