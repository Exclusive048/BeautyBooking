import { DayHeader } from "@/features/master/components/schedule/day-header";
import { TimeAxis } from "@/features/master/components/schedule/time-axis";
import { WeekGridColumn } from "@/features/master/components/schedule/week-grid-column";
import type { ScheduleDay } from "@/lib/master/schedule.service";

const HOUR_PX = 60;
/** Minimum column width on overflow-scroll surfaces (mobile). Desktop columns flex. */
const MIN_COL_PX = 168;

type Props = {
  days: ScheduleDay[];
  hourRange: { start: number; end: number };
};

/**
 * Five-row card containing the week grid. Header row pins the day
 * headers; the body lays out a left time axis + 7 day columns. The grid
 * uses `minmax(168px, 1fr)` so columns expand on desktop but force a
 * horizontal scroll on narrow viewports (mobile day-view comes in 25b).
 */
export function WeekGrid({ days, hourRange }: Props) {
  const gridTemplate = `64px repeat(7, minmax(${MIN_COL_PX}px, 1fr))`;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-bg-card">
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
