import { DayHeader } from "@/features/master/components/schedule/day-header";
import { TimeAxis } from "@/features/master/components/schedule/time-axis";
import { WeekGridColumn } from "@/features/master/components/schedule/week-grid-column";
import { HScrollShadow } from "@/components/ui/h-scroll-shadow";
import type { ScheduleDay } from "@/lib/master/schedule.service";

/** Shared with the day view (PWA-UX-BATCH-01) so both grids keep one vertical scale. */
export const HOUR_PX = 60;
/**
 * Minimum column width on overflow-scroll surfaces. FIX-BATCH-E: tightened
 * 168→120 so all 7 weekday columns fit at desktop (≥1280) instead of the
 * weekend being hidden behind an invisible scroll; columns still flex wider to
 * fill extra space (`1fr`), and narrower viewports force a horizontal scroll
 * (now with a visible edge-fade via HScrollShadow).
 */
const MIN_COL_PX = 120;

type Props = {
  days: ScheduleDay[];
  hourRange: { start: number; end: number };
  /** EXP-019: master (salon) tz threaded to the booking-card label formatter. */
  timezone: string;
  /** STUDIO-MASTER-PROFILES (этап 3): пометка «Личная / Студия» на карточках. */
  showWorkContext?: boolean;
};

/**
 * Five-row card containing the week grid. Header row pins the day
 * headers; the body lays out a left time axis + 7 day columns. The grid
 * uses `minmax(168px, 1fr)` so columns expand on desktop but force a
 * horizontal scroll on narrow viewports (mobile day-view comes in 25b).
 */
export function WeekGrid({ days, hourRange, timezone, showWorkContext = false }: Props) {
  const gridTemplate = `64px repeat(7, minmax(${MIN_COL_PX}px, 1fr))`;
  return (
    <HScrollShadow wrapperClassName="rounded-2xl border border-border-subtle bg-bg-card">
      <div className="min-w-fit">
        <div
          className="grid border-b border-border-subtle"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div />
          {days.map((d) => (
            <DayHeader key={d.iso} day={d.weekDay} />
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          <TimeAxis hourStart={hourRange.start} hourEnd={hourRange.end} hourPx={HOUR_PX} />
          {days.map((d) => (
            <WeekGridColumn
              key={d.iso}
              day={d}
              hourStart={hourRange.start}
              hourEnd={hourRange.end}
              hourPx={HOUR_PX}
              timezone={timezone}
              showWorkContext={showWorkContext}
            />
          ))}
        </div>
      </div>
    </HScrollShadow>
  );
}
