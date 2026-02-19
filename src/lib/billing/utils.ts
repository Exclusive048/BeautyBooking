import { createHash } from "crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function formatTimeBucketUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}-${hour}`;
}

export function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();

  const targetMonth = month + months;
  const base = new Date(Date.UTC(year, targetMonth, 1, hour, minute, second, ms));
  const daysInTargetMonth = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  base.setUTCDate(targetDay);
  return base;
}
