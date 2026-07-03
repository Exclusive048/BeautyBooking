/**
 * Time-grid constants and helpers for the day view. Slot size and the
 * visible window are tuned for the studio cabinet — masters cover a
 * wider day than the master cabinet's default. Adjustments are
 * intentionally locale-independent so the same constants drive
 * `top`/`height` math on the client and bucket assignment on the server.
 */

import { getLocalTimeParts } from "@/lib/schedule/timezone";

export const DAY_START_HOUR = 9;
export const DAY_END_HOUR = 21;
export const SLOT_MINUTES = 30;
export const SLOT_HEIGHT_PX = 28;

export const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;
export const TOTAL_SLOTS = (TOTAL_HOURS * 60) / SLOT_MINUTES;
export const GRID_HEIGHT_PX = TOTAL_SLOTS * SLOT_HEIGHT_PX;

export function parseDateKey(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

export function toDateKey(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * FIX-STUDIO-CALENDAR-SALON-TZ: minute-of-day of a UTC instant in the
 * SALON's own tz. The grid axis (09:00–21:00) is salon-local, so a
 * booking's vertical position must be derived from its salon-local
 * time — not the UTC time-of-day (which shifts every non-UTC salon
 * off-grid) nor the host process tz. Mirrors the master surface's
 * `minuteOfDay(date, tz)` (schedule.service.ts). GRID-ONLY: display,
 * never slot-gen.
 */
export function salonMinuteOfDay(value: Date, timeZone: string): number {
  const { hour, minute } = getLocalTimeParts(value, timeZone);
  return hour * 60 + minute;
}

/**
 * Distance from the top of the grid (in pixels) for a salon-local
 * minute-of-day (see `salonMinuteOfDay`). Replaces the old
 * UTC-anchored `offsetPxFromDayStart` — with a fixed 09:00–21:00 axis,
 * anchoring on UTC-middnight drew a +5 salon's whole day above the top
 * edge (clipped). `top < 0` still means "before the visible window".
 */
export function offsetPxFromMinute(minuteOfDay: number): number {
  const dayStartMinutes = DAY_START_HOUR * 60;
  return ((minuteOfDay - dayStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

export function durationPx(startUtc: Date, endUtc: Date): number {
  const minutes = (endUtc.getTime() - startUtc.getTime()) / 60000;
  return Math.max((minutes / SLOT_MINUTES) * SLOT_HEIGHT_PX, SLOT_HEIGHT_PX);
}

export function* iterateSlotMinutes(): Generator<number> {
  for (let m = DAY_START_HOUR * 60; m < DAY_END_HOUR * 60; m += SLOT_MINUTES) {
    yield m;
  }
}

export function formatTime(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
