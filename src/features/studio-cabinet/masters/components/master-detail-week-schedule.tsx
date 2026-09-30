import Link from "next/link";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import type { WeekScheduleCell } from "../lib/week-occupancy";

const T = UI_TEXT.studioCabinet.mastersV2.detail.weekSchedule;

export function MasterDetailWeekSchedule({
  cells,
  viewToken,
}: {
  cells: WeekScheduleCell[];
  /**
   * STUDIO-MASTERS-PRIVACY-FIX-A: opaque HMAC token replaces the
   * master cuid that used to be threaded into the URL via
   * `masterId={detail.id}`. Same token reused across both deep-links
   * («Расписание мастера» button in the header + this «В календарь»
   * link), pre-signed server-side on `StudioMasterDetail.viewToken`.
   */
  viewToken: string;
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold text-text-main">
            {T.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-text-sec">{T.subtitle}</p>
        </div>
        <Link
          href={`/cabinet/studio/calendar?master=${encodeURIComponent(viewToken)}`}
          className="text-xs font-medium text-accent-text transition-colors hover:text-accent-text/80"
        >
          {T.seeCalendar}
        </Link>
      </header>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const percent =
            cell.total > 0
              ? Math.min(Math.round((cell.booked / cell.total) * 100), 100)
              : 0;
          return (
            <div
              key={cell.weekday}
              className={cn(
                "rounded-xl border p-2 text-center",
                cell.isToday
                  ? "border-primary/40 bg-primary/5"
                  : cell.isDayOff
                    ? "border-border-subtle bg-bg-input/30"
                    : "border-border-subtle bg-bg-card",
              )}
            >
              <p
                className={cn(
                  "font-mono text-[10px] uppercase tracking-wide",
                  cell.isToday ? "text-accent-text" : "text-text-sec",
                )}
              >
                {cell.dateLabel}
              </p>
              {cell.isDayOff ? (
                <p className="mt-2 text-[10px] text-text-sec">
                  <abbr title={T.dayOffFull} className="decoration-transparent">{T.dayOff}</abbr>
                </p>
              ) : (
                <>
                  <p className="mt-1.5 font-display text-sm font-semibold tabular-nums text-text-main">
                    {T.slotsTemplate
                      .replace("{booked}", String(cell.booked))
                      .replace("{total}", String(cell.total))}
                  </p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-input">
                    <div
                      className="h-full rounded-full bg-brand-gradient"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
