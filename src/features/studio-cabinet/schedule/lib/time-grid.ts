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

/**
 * BOOKING-FLOW-AUDIT-RESIDUALS — окно сетки дня (часы салона). 09–21 —
 * минимум, а не потолок: сервер раздвигает окно под часы мастеров, записи и
 * перерывы дня (`resolveGridWindow`). Раньше окно было зашито, и запись в
 * 08:00 или до 22:00 обрезалась краем сетки, а клик по такому времени был
 * невозможен.
 */
export type GridWindow = { startHour: number; endHour: number };

export const DEFAULT_GRID_WINDOW: GridWindow = { startHour: DAY_START_HOUR, endHour: DAY_END_HOUR };

/** Окно, покрывающее все переданные минуты дня салона (и не уже 09–21). */
export function resolveGridWindow(minutesOfDay: readonly number[]): GridWindow {
  let startHour = DAY_START_HOUR;
  let endHour = DAY_END_HOUR;
  for (const minute of minutesOfDay) {
    if (!Number.isFinite(minute)) continue;
    startHour = Math.min(startHour, Math.floor(minute / 60));
    endHour = Math.max(endHour, Math.ceil(minute / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) };
}

export function gridTotalSlots(window: GridWindow = DEFAULT_GRID_WINDOW): number {
  return ((window.endHour - window.startHour) * 60) / SLOT_MINUTES;
}

export function gridHeightPx(window: GridWindow = DEFAULT_GRID_WINDOW): number {
  return gridTotalSlots(window) * SLOT_HEIGHT_PX;
}

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
export function offsetPxFromMinute(
  minuteOfDay: number,
  window: GridWindow = DEFAULT_GRID_WINDOW,
): number {
  const dayStartMinutes = window.startHour * 60;
  return ((minuteOfDay - dayStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

export function durationPx(startUtc: Date, endUtc: Date): number {
  const minutes = (endUtc.getTime() - startUtc.getTime()) / 60000;
  return Math.max((minutes / SLOT_MINUTES) * SLOT_HEIGHT_PX, SLOT_HEIGHT_PX);
}

export function* iterateSlotMinutes(window: GridWindow = DEFAULT_GRID_WINDOW): Generator<number> {
  for (let m = window.startHour * 60; m < window.endHour * 60; m += SLOT_MINUTES) {
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
