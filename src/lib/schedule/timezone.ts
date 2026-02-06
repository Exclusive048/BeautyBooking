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
