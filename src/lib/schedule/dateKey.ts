import { toUtcFromLocalDateTime } from "@/lib/schedule/timezone";

type DateKeyParts = {
  year: number;
  month: number;
  day: number;
};

export function parseDateKeyParts(key: string): DateKeyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day };
}

export function parseDateKeyToUtc(dateKey: string): Date {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

export function dateFromLocalDateKey(dateKey: string, timeZone: string, hour = 12, minute = 0): Date {
  const base = parseDateKeyToUtc(dateKey);
  return toUtcFromLocalDateTime(base, hour, minute, timeZone);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const base = parseDateKeyToUtc(dateKey);
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function compareDateKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
