import type { AvailabilitySlot } from "@/lib/domain/schedule";
import { addMinutes, minutesToTime, timeToMinutes } from "@/lib/schedule/time";
import { dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { getLocalTimeParts, toLocalDateKey, toUtcFromLocalDateTime } from "@/lib/schedule/timezone";
import type { DayPlan } from "@/lib/schedule/types";

type BookingRange = {
  startAtUtc: Date;
  endAtUtc: Date;
};

type BuildSlotsInput = {
  dayPlan: DayPlan;
  dateKey: string;
  timeZone: string;
  serviceDurationMin: number;
  bufferMin: number;
  bookings: BookingRange[];
  now: Date;
};

type BlockInterval = { start: number; end: number };

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function buildBlockIntervals(breaks: Array<{ start: string; end: string }>): BlockInterval[] {
  return breaks
    .map((item) => {
      const start = timeToMinutes(item.start);
      const end = timeToMinutes(item.end);
      if (start === null || end === null || start >= end) return null;
      return { start, end };
    })
    .filter((item): item is BlockInterval => item !== null);
}

export function buildSlotsForDay(input: BuildSlotsInput): AvailabilitySlot[] {
  if (!input.dayPlan.isWorking) return [];
  if (input.dayPlan.workingIntervals.length === 0) return [];
  if (!Number.isInteger(input.serviceDurationMin) || input.serviceDurationMin <= 0) return [];

  const nowLocalKey = toLocalDateKey(input.now, input.timeZone);
  const nowParts = getLocalTimeParts(input.now, input.timeZone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;

  const stepMin = 5;
  const slots: AvailabilitySlot[] = [];
  const blockIntervals = buildBlockIntervals(input.dayPlan.breaks);
  const dateForLocal = dateFromLocalDateKey(input.dateKey, input.timeZone);

  for (const interval of input.dayPlan.workingIntervals) {
    const windowStart = timeToMinutes(interval.start);
    const windowEnd = timeToMinutes(interval.end);
    if (windowStart === null || windowEnd === null || windowStart >= windowEnd) continue;

    let start = roundUpToStep(windowStart, stepMin);
    const end = roundDownToStep(windowEnd, stepMin);

    if (input.dateKey < nowLocalKey) continue;
    if (input.dateKey === nowLocalKey) {
      start = Math.max(start, roundUpToStep(nowMinutes, stepMin));
    }

    for (let t = start; t + input.serviceDurationMin <= end; t += stepMin) {
      const blocked = blockIntervals.some((b) => t < b.end && t + input.serviceDurationMin > b.start);
      if (blocked) continue;

      const startUtc = toUtcFromLocalDateTime(dateForLocal, Math.floor(t / 60), t % 60, input.timeZone);
      const endUtc = addMinutes(startUtc, input.serviceDurationMin);

      const hasConflict = input.bookings.some((booking) => {
        const bufferedStart = input.bufferMin ? addMinutes(booking.startAtUtc, -input.bufferMin) : booking.startAtUtc;
        const bufferedEnd = input.bufferMin ? addMinutes(booking.endAtUtc, input.bufferMin) : booking.endAtUtc;
        return startUtc < bufferedEnd && endUtc > bufferedStart;
      });
      if (hasConflict) continue;

      slots.push({
        startAtUtc: startUtc,
        endAtUtc: endUtc,
        label: `${input.dateKey} ${minutesToTime(t)}`,
      });
    }
  }

  return slots;
}
