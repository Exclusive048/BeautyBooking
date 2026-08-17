import {
  getLocalTimeParts,
  toLocalDateKey,
  toUtcFromLocalDateTime,
} from "@/lib/schedule/timezone";

/**
 * TZ-DISPLAY-SALON-PARITY-01 — salon-tz `datetime-local` conversion for every
 * cabinet surface where a wall-clock time is typed or pre-filled.
 *
 * LOGIC-21: жил в `features/studio-cabinet/schedule/lib/`, пока потребителями
 * были только студийные диалоги. Мастерский quick-create болел ровно тем же
 * (клик по ячейке строил инстант в tz БРАУЗЕРА), и переиспользовать модуль
 * из чужого слайса-кабинета было нельзя — поэтому он переехал сюда, к
 * `timezone.ts`, на котором и держится. Единственный источник конверсии
 * salon-local ↔ UTC для `datetime-local`-ввода: вторая копия обязана не
 * появиться.
 *
 * A native `<input type="datetime-local">` is inherently interpreted in the
 * BROWSER's local tz. For a cross-tz studio admin (e.g. a Moscow browser on a
 * Yekaterinburg salon), a raw `new Date(iso)` populate + `new Date(value)`
 * submit shows/edits the time in the admin's own tz — diverging from the
 * salon-tz grid they clicked. These converters make the admin edit the time
 * as SALON-LOCAL wall-clock (rule 8: stored time stays UTC; only the edited
 * wall-clock tz changes). Client-safe (pure Intl via `@/lib/schedule/timezone`).
 */

/**
 * UTC ISO instant → the salon-local `"YYYY-MM-DDTHH:mm"` string a
 * `datetime-local` input shows (so the admin sees/edits the salon's wall clock).
 */
export function utcIsoToSalonInput(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dateKey = toLocalDateKey(date, timeZone); // salon-local YYYY-MM-DD
  const { hour, minute } = getLocalTimeParts(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateKey}T${pad(hour)}:${pad(minute)}`;
}

/**
 * The salon-local `"YYYY-MM-DDTHH:mm"` the admin entered → the UTC ISO instant,
 * interpreting the wall-clock in the SALON tz (NOT the browser tz). Returns null
 * for an empty/malformed value.
 */
export function salonInputToUtcIso(value: string, timeZone: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  // Build a Date whose UTC y/m/d equals the entered date, then interpret the
  // wall-clock hour/minute in the salon tz → UTC (mirrors day-grid empty-slot).
  const baseDate = new Date(Date.UTC(year, month - 1, day));
  const utc = toUtcFromLocalDateTime(baseDate, hour, minute, timeZone);
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString();
}

/**
 * A salon-local `datetime-local` value (`YYYY-MM-DDTHH:00`) for the day that
 * `dayIso` falls on, at the given salon-local `hour`. Used for default break /
 * slot times so a cross-tz admin gets the SALON's wall-clock hour (e.g. 13:00
 * Yekaterinburg), not their own browser's. Returns "" for a malformed `dayIso`.
 */
export function salonLocalDatetimeInput(dayIso: string, hour: number, timeZone: string): string {
  const day = new Date(dayIso);
  if (Number.isNaN(day.getTime())) return "";
  const dateKey = toLocalDateKey(day, timeZone); // salon-local YYYY-MM-DD
  return `${dateKey}T${String(hour).padStart(2, "0")}:00`;
}
