import type { ScheduleBreakInterval } from "@/lib/domain/schedule";
import { dateFromKey, timeToMinutes } from "@/lib/schedule/time";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export type ScheduleOverrideKindValue = "OFF" | "TIME_RANGE";

/** Позиция графика — рабочий день из палитры или выходной. */
export type ScheduleRuleCycleDay = {
  isWorkday: boolean;
  startLocal?: string | null;
  endLocal?: string | null;
  breaks?: ScheduleBreakInterval[];
  /** Режим «Фиксированное время»: выбранные начала окошек. `null` — обычный день. */
  fixedStarts?: string[] | null;
  /** Рабочий день палитры — для раскраски календаря (этап 3). */
  templateId?: string | null;
};

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — период графика: последовательность позиций
 * `days` от даты отсчёта `anchorOn`, повторяется по кругу, действует с
 * `startsOn` по `endsOn` включительно (`null` — без границы). Неделя — частный
 * случай: 7 позиций от понедельника. Даты — даты салона `YYYY-MM-DD`.
 */
export type SchedulePeriodConfig = {
  startsOn: string | null;
  endsOn: string | null;
  anchorOn: string;
  days: ScheduleRuleCycleDay[];
  /** Откуда период: сохранённый график или неделя профиля без графика (до переноса). */
  source: "pattern" | "weekly-legacy";
};

/**
 * Правило профиля: периоды графика. Периоды не пересекаются (так их пишет
 * `lib/schedule/patterns.ts`); если бы пересеклись, действует первый в списке.
 * Дата, которую не покрывает ни один период, — выходной: расписание либо ещё
 * не началось, либо уже кончилось.
 */
export type ScheduleRuleConfig = {
  timezone: string;
  periods: SchedulePeriodConfig[];
};

export type ScheduleOverrideConfig = {
  date: Date;
  kind: ScheduleOverrideKindValue;
  startLocal: string | null;
  endLocal: string | null;
  breaks?: ScheduleBreakInterval[];
  /**
   * Режим дня решает исключение целиком, если оно есть: «Фиксированное время»
   * на дату — его начала, обычный день на дату — `null`, даже если по графику
   * в этот день фиксированное время.
   */
  fixedStarts?: string[] | null;
  /** Исключение «в этот день — рабочий день X из палитры». */
  templateId?: string | null;
  note?: string | null;
};

export type ProviderWorkday = {
  dateKey: string;
  timezone: string;
  isWorkday: boolean;
  startLocal: string | null;
  endLocal: string | null;
  breaks: ScheduleBreakInterval[];
  fixedStarts: string[] | null;
  /** Какой период графика дал день (`null` — дня нет ни в одном периоде). */
  periodSource: SchedulePeriodConfig["source"] | null;
  /** Рабочий день палитры, давший этот день (`null` — свои часы или выходной). */
  templateId: string | null;
};

type DayTemplate = {
  isWorkday: boolean;
  startLocal: string | null;
  endLocal: string | null;
  breaks: ScheduleBreakInterval[];
  fixedStarts: string[] | null;
  templateId: string | null;
};

const CLOSED_DAY: DayTemplate = {
  isWorkday: false,
  startLocal: null,
  endLocal: null,
  breaks: [],
  fixedStarts: null,
  templateId: null,
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
  fixedStarts?: string[] | null;
  templateId?: string | null;
}): DayTemplate {
  if (!input.isWorkday) {
    return CLOSED_DAY;
  }

  const startLocal = input.startLocal ?? null;
  const endLocal = input.endLocal ?? null;
  const startMinutes = startLocal ? timeToMinutes(startLocal) : null;
  const endMinutes = endLocal ? timeToMinutes(endLocal) : null;
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return CLOSED_DAY;
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
    fixedStarts: input.fixedStarts ?? null,
    templateId: input.templateId ?? null,
  };
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function diffDaysByDateKey(fromDateKey: string, toDateKey: string): number {
  const from = dateFromKey(fromDateKey);
  const to = dateFromKey(toDateKey);
  if (!from || !to) return 0;
  return Math.round((from.getTime() - to.getTime()) / (24 * 60 * 60 * 1000));
}

/** Позиция даты в цикле длиной `cycleLengthDays` от `anchorDateKey` (позиция 0). */
export function getCycleDayIndex(input: {
  dateKey: string;
  anchorDateKey: string;
  cycleLengthDays: number;
}): number {
  if (!Number.isInteger(input.cycleLengthDays) || input.cycleLengthDays <= 0) return 0;
  const diffDays = diffDaysByDateKey(input.dateKey, input.anchorDateKey);
  return positiveModulo(diffDays, input.cycleLengthDays);
}

/** Период, действующий на дату салона, — или `null`, если дату не покрывает ни один. */
export function findPeriodForDate(
  periods: SchedulePeriodConfig[],
  dateKey: string,
): SchedulePeriodConfig | null {
  for (const period of periods) {
    if (period.startsOn !== null && dateKey < period.startsOn) continue;
    if (period.endsOn !== null && dateKey > period.endsOn) continue;
    return period;
  }
  return null;
}

function resolveRuleTemplate(input: {
  dateKey: string;
  rule: ScheduleRuleConfig | null;
}): { day: DayTemplate; source: SchedulePeriodConfig["source"] | null } {
  if (!input.rule) return { day: CLOSED_DAY, source: null };
  const period = findPeriodForDate(input.rule.periods, input.dateKey);
  if (!period || period.days.length === 0) return { day: CLOSED_DAY, source: null };

  const idx = getCycleDayIndex({
    dateKey: input.dateKey,
    anchorDateKey: period.anchorOn,
    cycleLengthDays: period.days.length,
  });
  const day = period.days[idx];
  return { day: day ? normalizeDayTemplate(day) : CLOSED_DAY, source: period.source };
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

  const { day: base, source } = resolveRuleTemplate({ dateKey, rule: input.rule });

  const override = findOverrideForDate(dateKey, timezone, input.overrides);
  if (override?.kind === "OFF") {
    return { dateKey, timezone, ...CLOSED_DAY, periodSource: source };
  }

  const result = override?.kind === "TIME_RANGE"
    ? normalizeDayTemplate({
        isWorkday: true,
        startLocal: override.startLocal,
        endLocal: override.endLocal,
        breaks: override.breaks ?? base.breaks,
        // Режим решает исключение, а не график (см. `ScheduleOverrideConfig`).
        fixedStarts: override.fixedStarts ?? null,
        templateId: override.templateId ?? null,
      })
    : base;

  if (!result.isWorkday) {
    return { dateKey, timezone, ...CLOSED_DAY, periodSource: source };
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
    fixedStarts: result.fixedStarts,
    periodSource: source,
    templateId: result.templateId,
  };
}
