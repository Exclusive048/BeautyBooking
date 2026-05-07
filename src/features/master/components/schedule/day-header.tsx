import type { WeekDay } from "@/lib/master/schedule-utils";
import { cn } from "@/lib/cn";

type Props = {
  day: WeekDay;
};

/**
 * Single column header in the week grid: short cyrillic weekday, day
 * number (highlighted as a brand-coloured circle when "today"), and a
 * short month label hidden on the today cell.
 */
export function DayHeader({ day }: Props) {
  return (
    <div
      className={cn(
        "border-l border-border-subtle px-3 py-3 text-center",
        day.isToday && "bg-primary/5",
      )}
    >
      <p
        className={cn(
          "mb-1 font-mono text-[10px] uppercase tracking-[0.18em]",
          day.isToday ? "text-primary" : "text-text-sec",
        )}
      >
        {day.shortLabel}
      </p>
      <div className="flex items-baseline justify-center gap-1.5">
        {day.isToday ? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-gradient font-display text-base font-semibold text-white shadow-sm">
            {day.dayNumber}
          </span>
        ) : (
          <span className="font-display text-base text-text-main">{day.dayNumber}</span>
        )}
        {!day.isToday ? (
          <span className="text-[11px] text-text-sec">{day.monthShort}</span>
        ) : null}
      </div>
    </div>
  );
}
