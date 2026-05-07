"use client";

import { cn } from "@/lib/cn";
import type { DayScheduleDto } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.preview;
const DAY = UI_TEXT.cabinetMaster.scheduleSettings.week.days;

const SHORT_LABELS = [DAY.mon, DAY.tue, DAY.wed, DAY.thu, DAY.fri, DAY.sat, DAY.sun];

type Props = {
  weekSchedule: DayScheduleDto[];
};

/**
 * Right-rail preview that mirrors the editor's draft state. Each day is a
 * vertical bar with working blocks (filled) and breaks (notched). Read-only
 * — clicks do nothing. Updates immediately on every keystroke since it
 * pulls directly from the parent's draft state.
 */
export function WeekPreview({ weekSchedule }: Props) {
  return (
    <aside className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <h3 className="font-display text-base text-text-main">{T.title}</h3>
      <p className="mt-1 text-xs text-text-sec">{T.hint}</p>

      <div className="mt-4 grid grid-cols-7 gap-2">
        {weekSchedule.map((day) => (
          <DayColumn key={day.dayOfWeek} day={day} label={SHORT_LABELS[day.dayOfWeek]} />
        ))}
      </div>

      <dl className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-sec">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-primary/70" aria-hidden />
          <span>{T.legend.working}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-dashed border-border-subtle bg-bg-input" aria-hidden />
          <span>{T.legend.break}</span>
        </div>
      </dl>
    </aside>
  );
}

function DayColumn({ day, label }: { day: DayScheduleDto; label: string }) {
  if (!day.isWorkday) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs font-medium text-text-sec">{label}</span>
        <div className="h-32 w-full rounded-lg border border-dashed border-border-subtle bg-bg-input" aria-hidden />
        <span className="text-[10px] uppercase tracking-wide text-text-sec/70">{T.empty}</span>
      </div>
    );
  }

  if (day.scheduleMode === "FIXED") {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs font-medium text-text-main">{label}</span>
        <div className="flex h-32 w-full flex-col gap-1 rounded-lg border border-border-subtle bg-bg-input p-1.5">
          {day.fixedSlotTimes.slice(0, 6).map((time) => (
            <div
              key={time}
              className="rounded bg-primary/15 py-0.5 text-center text-[10px] text-primary"
            >
              {time}
            </div>
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-text-sec/70">
          {day.fixedSlotTimes.length}
        </span>
      </div>
    );
  }

  const startMin = toMinutes(day.startTime);
  const endMin = toMinutes(day.endTime);
  const span = Math.max(endMin - startMin, 1);
  const startLabel = day.startTime.slice(0, 5);
  const endLabel = day.endTime.slice(0, 5);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-medium text-text-main">{label}</span>
      <div
        className="relative h-32 w-full overflow-hidden rounded-lg border border-border-subtle bg-primary/15"
        aria-label={`${label}: ${startLabel} — ${endLabel}`}
      >
        {day.breaks.map((row, index) => {
          const breakStart = toMinutes(row.start);
          const breakEnd = toMinutes(row.end);
          const top = ((breakStart - startMin) / span) * 100;
          const height = Math.max(((breakEnd - breakStart) / span) * 100, 3);
          return (
            <div
              key={`${row.start}-${index}`}
              className={cn(
                "absolute inset-x-0 border-y border-dashed border-border-subtle bg-bg-input"
              )}
              style={{ top: `${Math.max(top, 0)}%`, height: `${height}%` }}
              aria-hidden
            />
          );
        })}
      </div>
      <span className="text-[10px] tabular-nums text-text-sec/80">
        {startLabel}–{endLabel}
      </span>
    </div>
  );
}

function toMinutes(time: string): number {
  const [hourRaw, minuteRaw] = time.split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}
