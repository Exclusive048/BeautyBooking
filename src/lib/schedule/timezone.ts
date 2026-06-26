import type { DayOfWeek } from "@/lib/domain/schedule";

const WEEKDAY_MAP: Record<string, DayOfWeek> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsFromDate(date: Date, timeZone: string): DateParts {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid date in partsFromDate: ${String(date)} (type=${typeof date}, value=${JSON.stringify(date)})`
    );
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

export function getLocalTimeParts(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = partsFromDate(date, timeZone);
  return { hour: parts.hour, minute: parts.minute };
}

/**
 * FIX-EXP-TZ-CROSS-SURFACE — the single entity-tz "HH:MM" formatter.
 *
 * The cross-surface contradiction class (EXP-017/019, the FIX-04/11/20/22
 * tail): surfaces formatted a stored-UTC booking/slot instant with a local
 * `formatHm` that read `date.getUTCHours()` (UTC) or `date.getHours()` (host
 * process tz) — so the same booking showed a different time on the dashboard
 * vs the kanban, and a week-card's label disagreed with its salon-tz grid
 * position. Both UTC and host-tz are wrong: appointment times must be shown in
 * the ENTITY's (salon's) own tz (QA-107 / FIX-22).
 *
 * `timeZone` is REQUIRED (no default) on purpose — a caller cannot accidentally
 * format in UTC/host tz and re-diverge. All booking/slot "HH:MM" displays route
 * through this one helper. Client-safe (Intl only, type-only import above).
 */
export function formatLocalHm(date: Date, timeZone: string): string {
  const { hour, minute } = getLocalTimeParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = partsFromDate(date, timeZone);
  const utcFromParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return utcFromParts - date.getTime();
}

export function getDayOfWeek(date: Date, timeZone: string): DayOfWeek {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);

  return WEEKDAY_MAP[weekday] ?? 0;
}

export function toUtcFromLocalDateTime(
  date: Date,
  hours: number,
  minutes: number,
  timeZone: string
): Date {
  const utcGuess = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function rejectDateKeyString(input: string): void {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error(`Date key string is not allowed in toLocalDateKey: ${input}`);
  }
}

export function toLocalDateKey(date: Date | number | string, timeZone: string): string {
  const value =
    typeof date === "string"
      ? (rejectDateKeyString(date), new Date(date))
      : typeof date === "number"
        ? new Date(date)
        : date;
  const parts = partsFromDate(value, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function toLocalDateKeyExclusive(date: Date, timeZone: string): string {
  const parts = partsFromDate(date, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const dateKey = `${parts.year}-${month}-${day}`;
  const isLocalMidnight =
    parts.hour === 0 && parts.minute === 0 && parts.second === 0 && date.getUTCMilliseconds() === 0;
  if (isLocalMidnight) {
    return dateKey;
  }
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
