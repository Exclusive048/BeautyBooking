import type { DayOfWeek, ScheduleBreakInterval } from "@/lib/domain/schedule";
import { dateFromKey, timeToMinutes } from "@/lib/schedule/time";
import { getDayOfWeek, toLocalDateKey } from "@/lib/schedule/timezone";

export type ScheduleRuleKindValue = "WEEKLY" | "CYCLE";
export type ScheduleOverrideKindValue = "OFF" | "TIME_RANGE";

export type ScheduleRuleWeeklyDay = {
  dayOfWeek: DayOfWeek;
  isWorkday: boolean;
  startLocal?: string | null;
  endLocal?: string | null;
  breaks?: ScheduleBreakInterval[];
};

export type ScheduleRuleCycleDay = {
  isWorkday: boolean;
  startLocal?: string | null;
  endLocal?: string | null;
  breaks?: ScheduleBreakInterval[];
};

export type ScheduleRulePayload =
  | {
      weekly: ScheduleRuleWeeklyDay[];
    }
  | {
      cycle: {
        days: ScheduleRuleCycleDay[];
      };
    };

export type ScheduleRuleConfig = {
  kind: ScheduleRuleKindValue;
  timezone: string;
  anchorDate: Date | null;
  payload: ScheduleRulePayload;
};

export type ScheduleOverrideConfig = {
  date: Date;
  kind: ScheduleOverrideKindValue;
  startLocal: string | null;
  endLocal: string | null;
  breaks?: ScheduleBreakInterval[];
  note?: string | null;
};

export type ProviderWorkday = {
  dateKey: string;
  timezone: string;
  isWorkday: boolean;
  startLocal: string | null;
  endLocal: string | null;
  breaks: ScheduleBreakInterval[];
};

function isBreakInterval(value: unknown): value is ScheduleBreakInterval {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.startLocal === "string" && typeof item.endLocal === "string";
}

function normalizeBreaks(value: unknown): ScheduleBreakInterval[] {
  if (!Array.isArray(value)) return [];
  const result: ScheduleBreakInterval[] = [];
  for (const entry of value) {
    if (!isBreakInterval(entry)) continue;
    const start = timeToMinutes(entry.startLocal);
    const end = timeToMinutes(entry.endLocal);
    if (start === null || end === null || start >= end) continue;
    result.push({
      startLocal: entry.startLocal,
      endLocal: entry.endLocal,
    });
  }
  return result;
}

function normalizeDayTemplate(input: {
  isWorkday: boolean;
  startLocal?: string | null;
  endLocal?: string | null;
  breaks?: unknown;
}): { isWorkday: boolean; startLocal: string | null; endLocal: string | null; breaks: ScheduleBreakInterval[] } {
  if (!input.isWorkday) {
    return { isWorkday: false, startLocal: null, endLocal: null, breaks: [] };
  }

  const startLocal = input.startLocal ?? null;
  const endLocal = input.endLocal ?? null;
  const startMinutes = startLocal ? timeToMinutes(startLocal) : null;
  const endMinutes = endLocal ? timeToMinutes(endLocal) : null;
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return { isWorkday: false, startLocal: null, endLocal: null, breaks: [] };
  }

  const rawBreaks = normalizeBreaks(input.breaks);
  const breaks = rawBreaks.filter((item) => {
    const breakStart = timeToMinutes(item.startLocal);
    const breakEnd = timeToMinutes(item.endLocal);
    if (breakStart === null || breakEnd === null) return false;
    return breakStart > startMinutes && breakEnd < endMinutes;
  });

  return {
    isWorkday: true,
    startLocal,
    endLocal,
    breaks,
  };
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function diffDaysByDateKey(fromDateKey: string, toDateKey: string): number {
  const from = dateFromKey(fromDateKey);
  const to = dateFromKey(toDateKey);
  if (!from || !to) return 0;
  return Math.floor((from.getTime() - to.getTime()) / (24 * 60 * 60 * 1000));
}

export function getCycleDayIndex(input: {
  dateKey: string;
  anchorDateKey: string;
  cycleLengthDays: number;
}): number {
  if (!Number.isInteger(input.cycleLengthDays) || input.cycleLengthDays <= 0) return 0;
  const diffDays = diffDaysByDateKey(input.dateKey, input.anchorDateKey);
  return positiveModulo(diffDays, input.cycleLengthDays);
}

function resolveRuleTemplate(input: {
  date: Date;
  dateKey: string;
  rule: ScheduleRuleConfig | null;
}): { isWorkday: boolean; startLocal: string | null; endLocal: string | null; breaks: ScheduleBreakInterval[] } {
  if (!input.rule) {
    return { isWorkday: false, startLocal: null, endLocal: null, breaks: [] };
  }

  if (input.rule.kind === "WEEKLY" && "weekly" in input.rule.payload) {
    const dayOfWeek = getDayOfWeek(input.date, input.rule.timezone);
    const day = input.rule.payload.weekly.find((item) => item.dayOfWeek === dayOfWeek);
    if (!day) {
      return { isWorkday: false, startLocal: null, endLocal: null, breaks: [] };
    }
    return normalizeDayTemplate(day);
  }

  if (input.rule.kind === "CYCLE" && "cycle" in input.rule.payload) {
    const cycleDays = input.rule.payload.cycle.days;
    if (cycleDays.length === 0 || !input.rule.anchorDate) {
      return { isWorkday: false, startLocal: null, endLocal: null, breaks: [] };
    }

    const anchorDateKey = toLocalDateKey(input.rule.anchorDate, input.rule.timezone);
    const idx = getCycleDayIndex({
      dateKey: input.dateKey,
      anchorDateKey,
      cycleLengthDays: cycleDays.length,
    });
    const day = cycleDays[idx];
    if (!day) {
      return { isWorkday: false, startLocal: null, endLocal: null, breaks: [] };
    }
    return normalizeDayTemplate(day);
  }

  return { isWorkday: false, startLocal: null, endLocal: null, breaks: [] };
}

function findOverrideForDate(
  dateKey: string,
  timezone: string,
  overrides: ScheduleOverrideConfig[]
): ScheduleOverrideConfig | null {
  for (const item of overrides) {
    const key = toLocalDateKey(item.date, timezone);
    if (key === dateKey) return item;
  }
  return null;
}

export function getProviderWorkday(input: {
  date: Date;
  rule: ScheduleRuleConfig | null;
  overrides: ScheduleOverrideConfig[];
  dateBreaks?: ScheduleBreakInterval[];
}): ProviderWorkday {
  const timezone = input.rule?.timezone ?? "Europe/Moscow";
  const dateKey = toLocalDateKey(input.date, timezone);

  const base = resolveRuleTemplate({
    date: input.date,
    dateKey,
    rule: input.rule,
  });

  const override = findOverrideForDate(dateKey, timezone, input.overrides);
  if (override?.kind === "OFF") {
    return {
      dateKey,
      timezone,
      isWorkday: false,
      startLocal: null,
      endLocal: null,
      breaks: [],
    };
  }

  const result = override?.kind === "TIME_RANGE"
    ? normalizeDayTemplate({
        isWorkday: true,
        startLocal: override.startLocal,
        endLocal: override.endLocal,
        breaks: override.breaks ?? base.breaks,
      })
    : base;

  if (!result.isWorkday) {
    return {
      dateKey,
      timezone,
      isWorkday: false,
      startLocal: null,
      endLocal: null,
      breaks: [],
    };
  }

  const startMinutes = result.startLocal ? timeToMinutes(result.startLocal) : null;
  const endMinutes = result.endLocal ? timeToMinutes(result.endLocal) : null;
  const dateBreaks = normalizeBreaks(input.dateBreaks).filter((item) => {
    if (startMinutes === null || endMinutes === null) return false;
    const breakStart = timeToMinutes(item.startLocal);
    const breakEnd = timeToMinutes(item.endLocal);
    if (breakStart === null || breakEnd === null) return false;
    return breakStart > startMinutes && breakEnd < endMinutes;
  });
  const useDateBreaks = !(override?.kind === "TIME_RANGE" && override.breaks && override.breaks.length > 0);
  const allBreaks = useDateBreaks ? [...result.breaks, ...dateBreaks] : result.breaks;

  return {
    dateKey,
    timezone,
    isWorkday: true,
    startLocal: result.startLocal,
    endLocal: result.endLocal,
    breaks: allBreaks,
  };
}

export function parseScheduleRulePayload(
  kind: ScheduleRuleKindValue,
  payloadJson: unknown
): ScheduleRulePayload | null {
  if (typeof payloadJson !== "object" || payloadJson === null) return null;
  const payload = payloadJson as Record<string, unknown>;

  if (kind === "WEEKLY") {
    const weeklyRaw = payload.weekly;
    if (!Array.isArray(weeklyRaw)) return null;

    const weekly: ScheduleRuleWeeklyDay[] = [];
    for (const raw of weeklyRaw) {
      if (typeof raw !== "object" || raw === null) continue;
      const item = raw as Record<string, unknown>;
      if (!Number.isInteger(item.dayOfWeek)) continue;
      const dayOfWeek = item.dayOfWeek as number;
      if (dayOfWeek < 0 || dayOfWeek > 6) continue;
      const isWorkday = Boolean(item.isWorkday);
      weekly.push({
        dayOfWeek: dayOfWeek as DayOfWeek,
        isWorkday,
        startLocal: typeof item.startLocal === "string" ? item.startLocal : null,
        endLocal: typeof item.endLocal === "string" ? item.endLocal : null,
        breaks: normalizeBreaks(item.breaks),
      });
    }
    return { weekly };
  }

  const cycleRaw = payload.cycle;
  if (typeof cycleRaw !== "object" || cycleRaw === null) return null;
  const cycle = cycleRaw as Record<string, unknown>;
  if (!Array.isArray(cycle.days)) return null;

  const days: ScheduleRuleCycleDay[] = [];
  for (const raw of cycle.days) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    days.push({
      isWorkday: Boolean(item.isWorkday),
      startLocal: typeof item.startLocal === "string" ? item.startLocal : null,
      endLocal: typeof item.endLocal === "string" ? item.endLocal : null,
      breaks: normalizeBreaks(item.breaks),
    });
  }

  return { cycle: { days } };
}

// Simple non-test examples for manual verification of cycle math.
export function exampleCycleChecks(): { anchor: string; date: string; idx: number }[] {
  return [
    { anchor: "2026-01-01", date: "2026-01-01", idx: getCycleDayIndex({ dateKey: "2026-01-01", anchorDateKey: "2026-01-01", cycleLengthDays: 4 }) },
    { anchor: "2026-01-01", date: "2026-01-02", idx: getCycleDayIndex({ dateKey: "2026-01-02", anchorDateKey: "2026-01-01", cycleLengthDays: 4 }) },
    { anchor: "2026-01-01", date: "2026-01-03", idx: getCycleDayIndex({ dateKey: "2026-01-03", anchorDateKey: "2026-01-01", cycleLengthDays: 4 }) },
    { anchor: "2026-01-01", date: "2026-01-04", idx: getCycleDayIndex({ dateKey: "2026-01-04", anchorDateKey: "2026-01-01", cycleLengthDays: 4 }) },
    { anchor: "2026-01-01", date: "2026-01-05", idx: getCycleDayIndex({ dateKey: "2026-01-05", anchorDateKey: "2026-01-01", cycleLengthDays: 4 }) },
  ];
}
