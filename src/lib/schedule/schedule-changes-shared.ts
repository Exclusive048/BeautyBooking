/**
 * SCHEDULE-PATTERNS-01 (хвост этапа 4, SCHEDULE-STUDIO-PROFILE-CALENDAR) —
 * заявка мастера на расписание В СТУДИИ, в которой КОПЯТСЯ правки.
 *
 * Профиль в студии мастер правит только заявкой, а открытая заявка у профиля
 * одна. Прежние форматы заменяли её целиком: график из окна (`PATTERN_V1`)
 * стирал отправленные «Особые дни» (`EDITOR_V1`) и наоборот. Теперь заявка —
 * набор правок: новая неделя ИЛИ новый график (действует последнее — оба
 * задают расписание с сегодняшнего дня) плюс правки дней календаря, по одной на
 * дату. Одобрение применяет всё одной транзакцией (`change-requests.ts`).
 *
 * Client-safe: типы и чистое слияние; карточка заявки студии читает их же.
 */

import type { CalendarPaintAction } from "@/lib/schedule/calendar-shared";
import type { DayScheduleDto } from "@/lib/schedule/editor-shared";
import type {
  DayTemplateDto,
  PatternChangeRequestBody,
  SchedulePatternDto,
} from "@/lib/schedule/patterns-shared";

export const SCHEDULE_CHANGES_FORMAT = "CHANGES_V1";

export type ScheduleDayChange = { date: string; action: CalendarPaintAction };

export type ScheduleChangesPayload = {
  format: typeof SCHEDULE_CHANGES_FORMAT;
  /**
   * Новая неделя (с сегодняшнего дня); `null` — не менялась. Слала её вкладка
   * «Часы», убранная SCHEDULE-HOURS-TAB-REMOVAL (2026-10-01); поле оставлено —
   * открытые заявки с неделей одобряются как раньше.
   */
  week: DayScheduleDto[] | null;
  /** Новый график из пошагового окна; `null` — не менялся. С `week` взаимоисключающи. */
  pattern: PatternChangeRequestBody | null;
  /** Правки дней календаря — по одной на дату, по возрастанию даты. */
  days: ScheduleDayChange[];
};

/** Одно действие мастера над заявкой. `withdraw` — убрать день из заявки. */
export type ScheduleChange =
  | { kind: "week"; week: DayScheduleDto[] }
  | { kind: "pattern"; pattern: PatternChangeRequestBody }
  | { kind: "days"; dates: string[]; action: CalendarPaintAction | { kind: "withdraw" } };

export function emptyScheduleChanges(): ScheduleChangesPayload {
  return { format: SCHEDULE_CHANGES_FORMAT, week: null, pattern: null, days: [] };
}

export function isScheduleChangesPayload(value: unknown): value is ScheduleChangesPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.format === SCHEDULE_CHANGES_FORMAT && Array.isArray(record.days);
}

export function isEmptyScheduleChanges(payload: ScheduleChangesPayload): boolean {
  return payload.week === null && payload.pattern === null && payload.days.length === 0;
}

/**
 * Правка поверх заявки. Неделя и график вытесняют друг друга (оба —
 * «расписание с сегодняшнего дня», действует последнее). День: новая правка
 * даты заменяет прежнюю; `withdraw` убирает дату из заявки; «как по графику»
 * на дату, у которой в расписании нет своей правки, — не изменение вовсе, и
 * дата из заявки просто уходит.
 */
export function mergeScheduleChange(
  payload: ScheduleChangesPayload,
  change: ScheduleChange,
  input: { overriddenDates: ReadonlySet<string> },
): ScheduleChangesPayload {
  if (change.kind === "week") return { ...payload, week: change.week, pattern: null };
  if (change.kind === "pattern") return { ...payload, pattern: change.pattern, week: null };

  const byDate = new Map(payload.days.map((day) => [day.date, day.action]));
  for (const date of change.dates) {
    const action = change.action;
    if (action.kind === "withdraw" || (action.kind === "reset" && !input.overriddenDates.has(date))) {
      byDate.delete(date);
    } else {
      byDate.set(date, action);
    }
  }
  return {
    ...payload,
    days: Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, action]) => ({ date, action })),
  };
}

// ─── Карточка заявки: «было / стало» ────────────────────────────────────────

/** Состояние дня так, как его показывает карточка. */
export type ReviewDayState = {
  isWorking: boolean;
  start: string | null;
  end: string | null;
  fixed: boolean;
  /** Имя рабочего дня палитры, если есть. */
  name: string | null;
};

export type ReviewDayChange = {
  date: string;
  before: ReviewDayState;
  /** `null` — «как по графику», каким станет день, решит график. */
  after: ReviewDayState | null;
};

/**
 * Что студия видит у заявки кроме её тела: график, действующий сейчас (сводку
 * строит карточка тем же `summarizePattern`, что и карточка графика), и дни
 * «было → стало» — только будущие: прошедшие одобрение пропустит.
 */
export type ScheduleRequestReview = {
  currentPattern: SchedulePatternDto | null;
  currentTemplates: DayTemplateDto[];
  days: ReviewDayChange[];
};
