import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HeatmapSection as HeatmapSectionData } from "@/lib/master/analytics-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { getHeatmapBgClass, getHeatmapTextClass, getHeatmapTier } from "./lib/format";

const T = UI_TEXT.cabinetMaster.analytics.heatmap;

const WEEKDAY_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]; // engine convention 1..7
const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

type Props = {
  data: HeatmapSectionData | null;
};

/**
 * 7×12 grid: weekdays Mon→Sun, hours 10–21. Cell intensity is computed
 * **relative to the period's max count** in 30a — i.e. "how busy is
 * this slot vs your busiest slot". The header subtitle clarifies this
 * (label "Относительно пика за период"). Real capacity-based
 * utilization is in the BACKLOG.
 *
 * Insight banner appears when the aggregator's simple rule found a
 * weekday/hour gap surrounded by busy neighbours.
 */
export function HeatmapSection({ data }: Props) {
  if (!data || data.cells.length === 0) {
    return (
      <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
        <Header />
        <div className="mt-4 rounded-xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-8 text-center">
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-sec">{T.emptyBody}</p>
        </div>
      </section>
    );
  }

  // Index by weekday × hour for fast cell lookup.
  // engine weekday convention: Postgres EXTRACT(DOW) → 0=Sunday … 6=Saturday.
  const byKey = new Map<string, number>();
  for (const cell of data.cells) {
    byKey.set(`${cell.weekday}-${cell.hour}`, cell.count);
  }

  const max = Math.max(1, data.maxCount);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <Header />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <thead>
            <tr>
              <th aria-label="weekday" className="w-8" />
              {HOURS.map((hour) => (
                <th
                  key={hour}
                  className="font-mono text-[10px] font-normal text-text-sec"
                >
                  {hour}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_RU.map((label, weekdayIndexMonFirst) => {
              // Postgres DOW: Sun=0, Mon=1, …, Sat=6
              // Our display order: Mon, Tue, …, Sun
              const dow = weekdayIndexMonFirst === 6 ? 0 : weekdayIndexMonFirst + 1;
              return (
                <tr key={label}>
                  <td className="pr-2 text-right font-mono text-[10px] text-text-sec">
                    {label}
                  </td>
                  {HOURS.map((hour) => {
                    const count = byKey.get(`${dow}-${hour}`) ?? 0;
                    const intensity = max > 0 ? Math.round((count / max) * 100) : 0;
                    const tier = getHeatmapTier(intensity);
                    return (
                      <td key={hour} className="p-0">
                        <div
                          title={`${label} ${hour}:00 — ${count}`}
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-md font-mono text-[10px] transition-colors",
                            getHeatmapBgClass(intensity),
                            getHeatmapTextClass(intensity)
                          )}
                        >
                          {tier !== "empty" && tier !== "low" ? intensity : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.insight ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-text-main">
            {T.insightTemplate
              .replace("{weekday}", data.insight.weekdayLabel)
              .replace("{hour}", data.insight.hourLabel)}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-base text-text-main">{T.heading}</h2>
        <p className="mt-0.5 text-xs text-text-sec">{T.subtitle}</p>
        <p className="mt-1 text-[11px] italic text-text-sec/80">{T.labelHint}</p>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  // Show 5 stops mirroring `getHeatmapTier` cut-points.
  const stops = [10, 30, 50, 70, 90];
  return (
    <div className="flex items-center gap-2 text-[10px] text-text-sec">
      <span>{T.legendLow}</span>
      <span className="flex gap-0.5">
        {stops.map((value) => (
          <span
            key={value}
            className={cn("h-2 w-3.5 rounded-sm", getHeatmapBgClass(value))}
          />
        ))}
      </span>
      <span>{T.legendHigh}</span>
    </div>
  );
}
