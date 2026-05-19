import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { HeatmapSection } from "../../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.overview;

type Props = {
  data: HeatmapSection;
};

const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const HOUR_START = 10;
const HOUR_END = 22;

/**
 * Weekday × hour heatmap. Cell shade scales linearly with count vs
 * `maxCount`. Empty cells stay subtle so the busy windows pop. Hours
 * 10..22 cover the typical studio operating window — earlier/later
 * cells fold out (rarely populated).
 */
export function HoursHeatmap({ data }: Props) {
  if (data.cells.length === 0 || data.maxCount === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-sec">
        {T.noData}
      </div>
    );
  }

  const cellMap = new Map<string, number>();
  for (const cell of data.cells) {
    cellMap.set(`${cell.weekday}-${cell.hour}`, cell.count);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="w-8" />
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((hour) => (
              <th
                key={hour}
                className="w-6 text-[9px] font-mono font-normal tabular-nums text-text-sec"
              >
                {hour}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAY_LABELS.map((label, weekday) => (
            <tr key={weekday}>
              <th className="w-8 text-right text-[10px] font-mono font-normal text-text-sec">
                {label}
              </th>
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((hour) => {
                const count = cellMap.get(`${weekday}-${hour}`) ?? 0;
                const intensity = data.maxCount > 0 ? count / data.maxCount : 0;
                return (
                  <td
                    key={hour}
                    className={cn(
                      "h-5 rounded",
                      count > 0 ? "bg-primary" : "bg-bg-input/40",
                    )}
                    style={count > 0 ? { opacity: 0.25 + 0.75 * intensity } : undefined}
                    title={`${label} ${String(hour).padStart(2, "0")}:00 — ${count}`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
