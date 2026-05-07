import { BookingCardWeek } from "@/features/master/components/schedule/booking-card-week";
import { DayOffOverlay } from "@/features/master/components/schedule/day-off-overlay";
import { EmptyCellsOverlay } from "@/features/master/components/schedule/empty-cells-overlay";
import { TimeBlockCard } from "@/features/master/components/schedule/time-block-card";
import type { ScheduleDay } from "@/lib/master/schedule.service";
import { cn } from "@/lib/cn";

type Props = {
  day: ScheduleDay;
  hourStart: number;
  hourEnd: number;
  hourPx: number;
};

/**
 * One day column in the week grid. Layered top-to-bottom:
 *   1. Hour gridlines (background, with half-hour dashed sub-line)
 *   2. Day-off overlay if !working
 *   3. Working-window tint (light hint that shows where bookings are
 *      allowed, separate from the off-day overlay)
 *   4. Empty-cells overlay (click-to-create)
 *   5. TimeBlocks (striped)
 *   6. Bookings (stacking on top so they intercept clicks before the
 *      empty-cells overlay underneath)
 */
export function WeekGridColumn({ day, hourStart, hourEnd, hourPx }: Props) {
  const totalHours = hourEnd - hourStart;
  const totalMin = totalHours * 60;
  const pxPerMin = hourPx / 60;

  const occupied = [
    ...day.bookings.map((b) => ({
      startMin: b.startMinuteOfDay,
      endMin: b.endMinuteOfDay,
    })),
    ...day.timeBlocks.map((tb) => ({
      startMin: tb.startMinuteOfDay,
      endMin: tb.endMinuteOfDay,
    })),
  ];

  return (
    <div
      className={cn(
        "relative border-l border-border-subtle",
        day.weekDay.isToday && "bg-primary/[0.02]",
      )}
    >
      {/* Hour gridlines + half-hour dashed sub-line for visual rhythm. */}
      {Array.from({ length: totalHours }).map((_, i) => (
        <div
          key={i}
          style={{ height: hourPx }}
          className={cn(
            "relative",
            i > 0 && "border-t border-border-subtle/60",
          )}
        >
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-border-subtle/40"
            style={{ top: hourPx / 2 }}
          />
        </div>
      ))}

      {day.isOff ? <DayOffOverlay /> : null}

      {!day.isOff ? (
        <EmptyCellsOverlay
          iso={day.iso}
          hourStart={hourStart}
          hourEnd={hourEnd}
          hourPx={hourPx}
          workingIntervals={day.workingIntervals}
          occupied={occupied}
        />
      ) : null}

      {day.timeBlocks.map((tb) => {
        const top = (tb.startMinuteOfDay - hourStart * 60) * pxPerMin;
        const height = (tb.endMinuteOfDay - tb.startMinuteOfDay) * pxPerMin;
        if (top + height < 0 || top > totalMin * pxPerMin) return null;
        return (
          <TimeBlockCard
            key={tb.id}
            block={tb}
            topPx={Math.max(0, top)}
            heightPx={Math.min(totalMin * pxPerMin - Math.max(0, top), height)}
          />
        );
      })}

      {day.bookings.map((booking) => {
        const top = (booking.startMinuteOfDay - hourStart * 60) * pxPerMin;
        const height = (booking.endMinuteOfDay - booking.startMinuteOfDay) * pxPerMin;
        if (top + height < 0 || top > totalMin * pxPerMin) return null;
        return (
          <BookingCardWeek
            key={booking.id}
            booking={booking}
            topPx={Math.max(0, top)}
            heightPx={Math.min(totalMin * pxPerMin - Math.max(0, top), height)}
          />
        );
      })}
    </div>
  );
}
