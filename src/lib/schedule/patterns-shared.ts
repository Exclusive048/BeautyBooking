/**
 * SCHEDULE-PATTERNS-01 (этап 2) — client-safe типы, константы и чистые хелперы
 * графиков. Серверный писатель — `patterns.ts`; сюда нельзя ничего, что тянет
 * Prisma или Redis (правило 13: пошаговое окно — клиентский компонент).
 *
 * Слова (решение владельца 2026-09-28): «график» — это чередование («график
 * 2/2», «график 5/2»); рабочие дни палитры называются своими именами («Утро
 * 9–15», «Полный день»). Слово «смена» не используется.
 */

import type { ScheduleDayColorKey } from "@/lib/schedule/calendar-shared";
import type { BreakDto } from "@/lib/schedule/editor-shared";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";

export type SchedulePatternKindValue = "WEEK" | "WEEKS" | "CYCLE";
export type ScheduleModeValue = "FLEXIBLE" | "FIXED";

/**
 * Понедельник, от которого отсчитываются недельные графики: позиция 0 = Пн.
 * Любой понедельник дал бы ту же раскладку; одна константа нужна, чтобы
 * одинаковые недели хранились одинаково и сравнивались как равные.
 */
export const WEEK_ANCHOR_MONDAY = "2024-01-01";

/** Самый длинный цикл: 4 недели чередования или произвольная серия до 28 дней. */
export const MAX_PATTERN_CYCLE_DAYS = 28;

/** Рабочий день из палитры. */
export type DayTemplateDto = {
  id: string;
  /** Имя, которое дал мастер (`ScheduleTemplate.label`); `null` — день создан редактором недели или окном (подпись — часами). */
  name: string | null;
  /** Цвет в календаре — ключ приглушённой палитры (сохранённый или по порядку). */
  color: ScheduleDayColorKey;
  startTime: string;
  endTime: string;
  breaks: BreakDto[];
  scheduleMode: ScheduleModeValue;
  fixedSlotTimes: string[];
  /**
   * Показывать кистью в календаре (этап 3): у дня есть имя, либо он стоит в
   * действующем или запланированном графике, либо в будущем дне календаря.
   * Дни, которые остались только в прошлом, в палитре не нужны.
   */
  inPalette: boolean;
  /** На день ссылается график (в том числе прошлый), неделя или будущий день календаря — удалить нельзя. */
  inUse: boolean;
};

/** Период графика: позиции от `anchorOn`, действует `startsOn…endsOn` включительно. */
export type SchedulePatternDto = {
  kind: SchedulePatternKindValue;
  cycleDays: number;
  anchorOn: string;
  /** `null` — с начала времён (перенесённая неделя). */
  startsOn: string | null;
  /** `null` — продлевается автоматически. */
  endsOn: string | null;
  /** id шаблона палитры или `null` — выходной. */
  days: Array<string | null>;
};

/** Что знает кабинет о графике мастера на сегодня. */
export type SchedulePlanDto = {
  /** Сегодня по поясу салона. */
  todayKey: string;
  /** Период, действующий сегодня (`null` — сегодня расписания нет). */
  current: SchedulePatternDto | null;
  /** Периоды, начинающиеся после сегодня (запланированные смены графика). */
  upcoming: SchedulePatternDto[];
  /** Последний день настроенного расписания; `null` — продлевается автоматически или расписания нет. */
  configuredUntil: string | null;
  /** Есть ли расписание вообще — сегодня или впереди. */
  hasSchedule: boolean;
  /** Палитра рабочих дней. */
  templates: DayTemplateDto[];
};

/** Позиция даты в цикле (0…cycleDays-1). Даты — ключи `YYYY-MM-DD`. */
export function patternPosition(dateKey: string, anchorOn: string, cycleDays: number): number {
  const diff = Math.round(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${anchorOn}T00:00:00Z`)) / 86_400_000,
  );
  return ((diff % cycleDays) + cycleDays) % cycleDays;
}

/** Понедельник ли дата (ключ `YYYY-MM-DD`). */
export function isMondayKey(dateKey: string): boolean {
  return isDateKey(dateKey) && new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 1;
}

/** Понедельник недели, в которую попадает дата. */
export function mondayOfWeekKey(dateKey: string): string {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 = Вс
  return addDaysToDateKey(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

/**
 * Готовые графики «N рабочих через M выходных» (решение владельца: 2/2, 3/2,
 * 1/2 и т.д.). Порядок — по частоте в салонах.
 */
export const CYCLE_PRESETS: ReadonlyArray<{ id: string; work: number; off: number }> = [
  { id: "2x2", work: 2, off: 2 },
  { id: "3x3", work: 3, off: 3 },
  { id: "1x2", work: 1, off: 2 },
  { id: "3x2", work: 3, off: 2 },
  { id: "4x2", work: 4, off: 2 },
  { id: "1x1", work: 1, off: 1 },
  { id: "1x3", work: 1, off: 3 },
];

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — заявка мастера на расписание В СТУДИИ в
 * формате графика: то же тело, что у пошагового окна (`patternRequestSchema`,
 * `pattern-request.ts`). Здесь — только форма, по которой её узнают карточка
 * заявки и одобрение; полную проверку делает одобрение той же схемой.
 */
export const PATTERN_CHANGE_REQUEST_FORMAT = "PATTERN_V1";

export type PatternChangeRequestBody = {
  templates: Array<{
    label?: string;
    color?: string;
    startTime: string;
    endTime: string;
    breaks: Array<{ start: string; end: string; title?: string | null }>;
    scheduleMode: ScheduleModeValue;
    fixedSlotTimes: string[];
  }>;
  pattern: {
    kind: SchedulePatternKindValue;
    cycleDays: number;
    anchorOn: string;
    startsOn: string;
    endsOn: string | null;
    days: Array<number | null>;
    resumePrevious: boolean;
  };
};

export type PatternChangeRequestPayload = {
  format: typeof PATTERN_CHANGE_REQUEST_FORMAT;
  request: PatternChangeRequestBody;
};

export function isPatternChangeRequestPayload(value: unknown): value is PatternChangeRequestPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.format !== PATTERN_CHANGE_REQUEST_FORMAT) return false;
  const request = record.request as Record<string, unknown> | undefined;
  return Boolean(request && Array.isArray(request.templates) && request.pattern && typeof request.pattern === "object");
}
