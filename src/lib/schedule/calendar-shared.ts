/**
 * SCHEDULE-PATTERNS-01 (этап 3) — календарь расписания на 3 месяца: client-safe
 * типы и константы. Серверная часть — `calendar.ts`; сюда нельзя ничего, что
 * тянет Prisma или Redis (правило 13: календарь — клиентский компонент).
 *
 * Модель (раздел 3 плана `docs/audits/SCHEDULE-PATTERNS-01.md`): на дату
 * действует правка календаря («Особый день», `ScheduleOverride`), иначе —
 * график периода, иначе — выходной. Покраска дня кистью палитры пишет правку;
 * «как по графику» её снимает.
 */

import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import type { BreakDto } from "@/lib/schedule/editor-shared";
import type { SchedulePlanDto } from "@/lib/schedule/patterns-shared";

/**
 * Приглушённые цвета палитры (решение владельца 2026-09-28: у каждого мастера
 * своя палитра, цвета неяркие). Ключ хранится в `ScheduleTemplate.color`,
 * значения — токены `schedule-day-1…6` (`globals.css` + мост в
 * `tailwind.config.js`), тёмная тема встроена в переменные.
 */
export const SCHEDULE_DAY_COLOR_KEYS = ["1", "2", "3", "4", "5", "6"] as const;
export type ScheduleDayColorKey = (typeof SCHEDULE_DAY_COLOR_KEYS)[number];

export function isScheduleDayColorKey(value: unknown): value is ScheduleDayColorKey {
  return typeof value === "string" && (SCHEDULE_DAY_COLOR_KEYS as readonly string[]).includes(value);
}

/**
 * Цвет рабочего дня: сохранённый ключ, а если его нет (день создан редактором
 * недели или до этапа 3) — по порядку в палитре. Порядок стабилен (по дате
 * создания), поэтому цвет не «прыгает» между открытиями.
 */
export function paletteColorKey(color: string | null, index: number): ScheduleDayColorKey {
  if (isScheduleDayColorKey(color)) return color;
  return SCHEDULE_DAY_COLOR_KEYS[((index % SCHEDULE_DAY_COLOR_KEYS.length) + SCHEDULE_DAY_COLOR_KEYS.length) %
    SCHEDULE_DAY_COLOR_KEYS.length];
}

/**
 * За сколько дней до конца настроенного расписания предупреждать (при
 * выключенном автопродлении): уведомление (`schedule-ending.ts`) и плашка в
 * карточке графика — одно окно.
 */
export const SCHEDULE_ENDING_NOTICE_DAYS = 7;

/**
 * Расписание кончается в ближайшие `SCHEDULE_ENDING_NOTICE_DAYS` дней, а
 * автопродление выключено. Одно правило для карточки графика и главной
 * кабинета. Даты — ключи дат салона.
 */
export function isScheduleEndingSoon(plan: { todayKey: string; configuredUntil: string | null }): boolean {
  if (plan.configuredUntil === null || plan.configuredUntil < plan.todayKey) return false;
  return plan.configuredUntil <= addDaysToDateKey(plan.todayKey, SCHEDULE_ENDING_NOTICE_DAYS);
}

/** Рабочих дней с именем в палитре — не больше. */
export const MAX_PALETTE_DAYS = 12;

/** Длина имени рабочего дня (`ScheduleTemplate.label`, VARCHAR(40)). */
export const PALETTE_LABEL_MAX = 40;

/** День календаря — так, как его видит движок окошек. */
export type CalendarDayDto = {
  /** Дата салона `YYYY-MM-DD`. */
  date: string;
  /** Раньше сегодняшнего дня салона — только для просмотра. */
  past: boolean;
  /** Дальше горизонта расписания (3 месяца) — закрыт. */
  beyond: boolean;
  isWorking: boolean;
  /** Часы дня (время салона); у фиксированного времени — первое и последнее окошко. */
  start: string | null;
  end: string | null;
  /** День в режиме «Фиксированное время». */
  fixed: boolean;
  /** Рабочий день палитры, давший этот день (`null` — свои часы или выходной). */
  templateId: string | null;
  /** День изменён в календаре, а не взят из графика. */
  painted: boolean;
  /** Записей этого профиля на день (кроме отменённых). */
  bookings: number;
};

/** Рабочий день мастера в студии — в личном календаре только для чтения (этап 4). */
export type CalendarStudioDayDto = { start: string | null; end: string | null; fixed: boolean };

/**
 * Открытая заявка профиля в студии (SCHEDULE-STUDIO-PROFILE-CALENDAR): что
 * мастер уже отправил студии. Календарь показывает дни заявки поверх текущих.
 */
export type CalendarPendingDto = {
  hasWeek: boolean;
  hasPattern: boolean;
  days: Array<{ date: string; action: CalendarPaintAction }>;
};

/** Действие над днём в режиме заявки: покраска либо «убрать день из заявки». */
export type CalendarRequestAction = CalendarPaintAction | { kind: "withdraw" };

export type ScheduleCalendarDto = {
  timezone: string;
  /** Режим заявки (профиль в студии): отправленное студии; иначе `null`. */
  pending: CalendarPendingDto | null;
  /**
   * Личный календарь мастера, который работает и в студии: его рабочие дни в
   * студии (время у человека одно — занятое там недоступно для личных записей).
   * Только для чтения: расписание в студии правит студия. `null` — студии нет.
   */
  studio: { name: string; days: Record<string, CalendarStudioDayDto> } | null;
  /** Сегодня по поясу салона. */
  todayKey: string;
  /** Первый показанный день — начало текущего месяца. */
  fromKey: string;
  /** Последний день, который можно настроить (сегодня + горизонт). */
  lastKey: string;
  days: CalendarDayDto[];
};

/** Что сделать с выбранными днями. */
export type CalendarPaintAction =
  | { kind: "template"; templateId: string }
  | { kind: "off" }
  | { kind: "reset" }
  | {
      kind: "hours";
      startTime: string;
      endTime: string;
      breaks: BreakDto[];
      /**
       * Фиксированное время на день. Шторка дня его не предлагает (для него —
       * рабочий день палитры); приходит из заявки студии, перенесённой из
       * «Особых дней» старого формата.
       */
      fixedSlotTimes?: string[];
    };

/** Рабочий день палитры, как его создаёт и правит кабинет. */
export type PaletteDayInput = {
  label: string;
  color: ScheduleDayColorKey;
  startTime: string;
  endTime: string;
  breaks: BreakDto[];
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotTimes: string[];
};

/** «График команды» студии: сколько дней в окне доски. */
export const TEAM_BOARD_DAYS = 14;

/** Строка доски — один мастер студии: его график, палитра и дни окна. */
export type TeamBoardMasterDto = {
  id: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  plan: SchedulePlanDto;
  days: CalendarDayDto[];
};

export type TeamBoardDto = {
  /** Сегодня по поясу студии. */
  todayKey: string;
  /** Первый день окна. */
  fromKey: string;
  /** Последний день, который можно настроить. */
  lastKey: string;
  /** Самое раннее начало окна (история — 4 недели назад). */
  minFromKey: string;
  dates: string[];
  masters: TeamBoardMasterDto[];
};
