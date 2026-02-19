import {
  addDaysToDateKey,
  compareDateKeys,
  dateFromLocalDateKey,
  diffDateKeys,
  isDateKey,
  parseDateKeyParts,
} from "@/lib/schedule/dateKey";

export type AnalyticsPeriod = "today" | "week" | "month" | "quarter" | "custom";

export type AnalyticsRange = {
  fromKey: string;
  toKey: string;
  fromUtc: Date;
  toUtcExclusive: Date;
  days: number;
};

export type AnalyticsRangeWithCompare = {
  range: AnalyticsRange;
  prevRange: AnalyticsRange | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(parts: DateParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function getLocalDateParts(date: Date, timeZone: string): DateParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
}

function resolvePresetRange(period: AnalyticsPeriod, timeZone: string): { fromKey: string; toKey: string } {
  const now = new Date();
  const todayKey = toDateKey(getLocalDateParts(now, timeZone));

  if (period === "today") {
    return { fromKey: todayKey, toKey: todayKey };
  }

  if (period === "week") {
    return { fromKey: addDaysToDateKey(todayKey, -6), toKey: todayKey };
  }

  if (period === "month") {
    const parts = getLocalDateParts(now, timeZone);
    return { fromKey: `${parts.year}-${pad2(parts.month)}-01`, toKey: todayKey };
  }

  if (period === "quarter") {
    const parts = getLocalDateParts(now, timeZone);
    const quarterStartMonth = Math.floor((parts.month - 1) / 3) * 3 + 1;
    return { fromKey: `${parts.year}-${pad2(quarterStartMonth)}-01`, toKey: todayKey };
  }

  return { fromKey: todayKey, toKey: todayKey };
}

function buildRange(fromKey: string, toKey: string, timeZone: string): AnalyticsRange {
  if (!isDateKey(fromKey) || !isDateKey(toKey)) {
    throw new Error(`Invalid date keys: ${fromKey} - ${toKey}`);
  }
  if (compareDateKeys(fromKey, toKey) > 0) {
    throw new Error(`Invalid date range: ${fromKey} - ${toKey}`);
  }

  const toKeyExclusive = addDaysToDateKey(toKey, 1);
  const fromUtc = dateFromLocalDateKey(fromKey, timeZone, 0, 0);
  const toUtcExclusive = dateFromLocalDateKey(toKeyExclusive, timeZone, 0, 0);
  const days = diffDateKeys(fromKey, toKeyExclusive);

  return {
    fromKey,
    toKey,
    fromUtc,
    toUtcExclusive,
    days,
  };
}

export function resolveRangeWithCompare(input: {
  period: AnalyticsPeriod;
  timeZone: string;
  from?: string | null;
  to?: string | null;
  compare?: boolean;
}): AnalyticsRangeWithCompare {
  const period = input.period;
  const base =
    period === "custom"
      ? {
          fromKey: input.from && isDateKey(input.from) ? input.from : "",
          toKey: input.to && isDateKey(input.to) ? input.to : "",
        }
      : resolvePresetRange(period, input.timeZone);

  if (period === "custom") {
    if (!base.fromKey || !base.toKey) {
      throw new Error("Custom range requires from and to");
    }
  }

  const range = buildRange(base.fromKey, base.toKey, input.timeZone);

  if (!input.compare) {
    return { range, prevRange: null };
  }

  const prevToKey = addDaysToDateKey(range.fromKey, -1);
  const prevFromKey = addDaysToDateKey(prevToKey, -(range.days - 1));
  const prevRange = buildRange(prevFromKey, prevToKey, input.timeZone);

  return { range, prevRange };
}

export function resolveMonthRange(input: { month: string; timeZone: string }): AnalyticsRange {
  const match = /^(\d{4})-(\d{2})$/.exec(input.month);
  if (!match) {
    throw new Error(`Invalid month: ${input.month}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${input.month}`);
  }
  const fromKey = `${year}-${pad2(month)}-01`;
  const fromParts = parseDateKeyParts(fromKey);
  if (!fromParts) {
    throw new Error(`Invalid month: ${input.month}`);
  }
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const toKeyExclusive = `${nextMonth.year}-${pad2(nextMonth.month)}-01`;
  const toKey = addDaysToDateKey(toKeyExclusive, -1);
  return buildRange(fromKey, toKey, input.timeZone);
}
