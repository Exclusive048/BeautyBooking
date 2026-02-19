import type { Prisma } from "@prisma/client";
import { getDayOfWeek, toLocalDateKey } from "@/lib/schedule/timezone";
import {
  addDaysToDateKey,
  dateFromLocalDateKey,
  listDateKeysInclusive,
  parseDateKeyParts,
} from "@/lib/schedule/dateKey";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";
import type { AnalyticsRange } from "@/features/analytics/domain/date-range";

export type TimelineGranularity = "day" | "week" | "month";

export function buildScopeWhere(context: AnalyticsContext): Prisma.BookingWhereInput {
  if (context.scope === "MASTER") {
    return {
      OR: [
        { masterProviderId: context.providerId },
        { masterProviderId: null, providerId: context.providerId },
      ],
    };
  }

  const studioScope: Prisma.BookingWhereInput = {
    OR: [{ studioId: context.studioId ?? undefined }, { providerId: context.providerId }],
  };

  if (context.masterFilterId) {
    return {
      AND: [studioScope, { masterProviderId: context.masterFilterId }],
    };
  }

  return studioScope;
}

export function buildStartAtRange(range: AnalyticsRange): Prisma.BookingWhereInput {
  return {
    startAtUtc: {
      not: null,
      gte: range.fromUtc,
      lt: range.toUtcExclusive,
    },
  };
}

export function buildCreatedAtRange(range: AnalyticsRange): Prisma.BookingWhereInput {
  return {
    createdAt: {
      gte: range.fromUtc,
      lt: range.toUtcExclusive,
    },
  };
}

export function parseTimeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, hours * 60 + minutes);
}

export function diffMinutes(start: string, end: string): number {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (endMin <= startMin) return 0;
  return endMin - startMin;
}

export function getBucketKey(date: Date, timeZone: string, granularity: TimelineGranularity): string {
  if (granularity === "day") {
    return toLocalDateKey(date, timeZone);
  }

  if (granularity === "week") {
    const dateKey = toLocalDateKey(date, timeZone);
    const dow = getDayOfWeek(date, timeZone);
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    return addDaysToDateKey(dateKey, -mondayOffset);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}`;
}

export function listBucketKeys(range: AnalyticsRange, timeZone: string, granularity: TimelineGranularity): string[] {
  if (granularity === "day") {
    return listDateKeysInclusive(range.fromKey, range.toKey);
  }

  if (granularity === "week") {
    const fromAnchor = dateFromLocalDateKey(range.fromKey, timeZone, 12, 0);
    const toAnchor = dateFromLocalDateKey(range.toKey, timeZone, 12, 0);
    const fromKey = getBucketKey(fromAnchor, timeZone, "week");
    const toKey = getBucketKey(toAnchor, timeZone, "week");
    const keys: string[] = [];
    let cursor = fromKey;
    while (cursor <= toKey) {
      keys.push(cursor);
      cursor = addDaysToDateKey(cursor, 7);
    }
    return keys;
  }

  const fromParts = parseDateKeyParts(range.fromKey);
  const toParts = parseDateKeyParts(range.toKey);
  if (!fromParts || !toParts) return [];
  const keys: string[] = [];
  let year = fromParts.year;
  let month = fromParts.month;
  const toIndex = toParts.year * 12 + toParts.month;
  while (year * 12 + month <= toIndex) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

export function countWeekdaysInRange(range: AnalyticsRange, timeZone: string): number[] {
  const counts = Array.from({ length: 7 }, () => 0);
  const keys = listDateKeysInclusive(range.fromKey, range.toKey);
  for (const key of keys) {
    const date = new Date(`${key}T12:00:00.000Z`);
    const dow = getDayOfWeek(date, timeZone);
    counts[dow] += 1;
  }
  return counts;
}
