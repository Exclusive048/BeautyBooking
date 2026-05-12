import type { DayScheduleDto } from "@/lib/schedule/editor-shared";

/**
 * Pure helpers for the per-day action menu.
 *
 * Each function returns a new `DayScheduleDto[]` of length 7 ordered by
 * `dayOfWeek` (matches the canonical server snapshot order). The caller
 * passes the array straight into the orchestrator's `setDraft` —
 * `useAutoSave` then absorbs the 6-day diff inside its debounce window.
 *
 * Copy semantics: only the **schedule-shape** fields travel (workday
 * status, times, mode, breaks, fixed slot times). `dayOfWeek` stays
 * with the target row.
 */

type CopyFields = Pick<
  DayScheduleDto,
  "isWorkday" | "scheduleMode" | "startTime" | "endTime" | "breaks" | "fixedSlotTimes"
>;

function copyFieldsFrom(source: DayScheduleDto): CopyFields {
  return {
    isWorkday: source.isWorkday,
    scheduleMode: source.scheduleMode,
    startTime: source.startTime,
    endTime: source.endTime,
    breaks: source.breaks.map((row) => ({ start: row.start, end: row.end })),
    fixedSlotTimes: [...source.fixedSlotTimes],
  };
}

/**
 * Copy this day's schedule onto every **other** workday (i.e. days
 * with `isWorkday: true`). Days that are off stay off. The source day
 * itself is left as-is.
 */
export function copyDayToWorkdays(
  weekSchedule: ReadonlyArray<DayScheduleDto>,
  sourceDayOfWeek: number,
): DayScheduleDto[] {
  const source = weekSchedule.find((day) => day.dayOfWeek === sourceDayOfWeek);
  if (!source) return [...weekSchedule];
  const fields = copyFieldsFrom(source);
  return weekSchedule.map((day) => {
    if (day.dayOfWeek === sourceDayOfWeek) return day;
    if (!day.isWorkday) return day;
    return { ...day, ...fields };
  });
}

/**
 * Copy this day's schedule onto **every other day**, including
 * currently-off ones. After this the week is uniform.
 */
export function copyDayToAll(
  weekSchedule: ReadonlyArray<DayScheduleDto>,
  sourceDayOfWeek: number,
): DayScheduleDto[] {
  const source = weekSchedule.find((day) => day.dayOfWeek === sourceDayOfWeek);
  if (!source) return [...weekSchedule];
  const fields = copyFieldsFrom(source);
  return weekSchedule.map((day) => {
    if (day.dayOfWeek === sourceDayOfWeek) return day;
    return { ...day, ...fields };
  });
}

/**
 * Reset a single day to "weekend" defaults: workday off, no breaks, no
 * fixed slot times. The day's `scheduleMode` stays so toggling the day
 * back on doesn't surprise the master with a mode switch. The
 * `startTime`/`endTime` keep their current values — the server
 * normaliser would re-default an empty range anyway, and preserving
 * them gives a sensible starting point when the master re-enables.
 */
export function clearDay(
  weekSchedule: ReadonlyArray<DayScheduleDto>,
  targetDayOfWeek: number,
): DayScheduleDto[] {
  return weekSchedule.map((day) => {
    if (day.dayOfWeek !== targetDayOfWeek) return day;
    return {
      ...day,
      isWorkday: false,
      breaks: [],
      fixedSlotTimes: [],
    };
  });
}
