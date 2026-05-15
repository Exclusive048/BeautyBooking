import { Sparkles } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioOccupancyRow } from "../server/types";

const T = UI_TEXT.studioCabinet.dashboardV2.topOccupancy;

export function StudioTopOccupancy({ rows }: { rows: StudioOccupancyRow[] }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4">
        <h3 className="font-display text-base font-semibold tracking-tight text-text-main">
          {T.title}
        </h3>
        <p className="mt-0.5 text-xs text-text-sec">{T.subtitle}</p>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Sparkles className="h-8 w-8 text-text-sec/40" aria-hidden />
          <p className="text-sm text-text-sec">{T.empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-[10px] text-text-sec">#{index + 1}</span>
                  <span className="ml-2 text-sm font-semibold text-text-main">
                    {row.name}
                  </span>
                </div>
                <span className="font-display text-sm font-semibold tabular-nums text-text-main">
                  {row.percent}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-input">
                <div
                  className="h-full rounded-full bg-brand-gradient"
                  style={{ width: `${row.percent}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-text-sec">
                {T.slotsTemplate
                  .replace("{booked}", String(row.bookingsCount))
                  .replace("{total}", String(row.capacity))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
