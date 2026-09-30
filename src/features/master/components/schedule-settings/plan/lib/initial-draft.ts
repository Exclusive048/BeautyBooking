import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import {
  CYCLE_PRESETS,
  patternPosition,
  type SchedulePatternKindValue,
  type SchedulePlanDto,
} from "@/lib/schedule/patterns-shared";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { dayHoursFromTemplate, type DayHoursDraft } from "./day-hours";
import { cycleWorkOff, isManualPattern } from "./describe-plan";

/** Вид графика в окне: три вида хранения плюс «отмечу дни сам» (цикл из одного выходного). */
export type WizardKind = SchedulePatternKindValue | "MANUAL";
export type WizardHoursMode = "same" | "perDay";

export const WORKDAYS_MASK = [true, true, true, true, true, false, false];

export type WizardDraft = {
  kind: WizardKind;
  weekDays: boolean[];
  cyclePreset: string;
  work: number;
  off: number;
  /** «2 через 2»: первый рабочий день (сегодня или позже). */
  firstDay: string;
  weeksCount: number;
  weeksDays: boolean[];
  /** Чередование недель: какая неделя идёт сейчас (с 1). */
  currentWeek: number;
  autoExtend: boolean;
  endsOn: string;
  hoursMode: WizardHoursMode;
  sameHours: DayHoursDraft;
  perDay: Record<string, DayHoursDraft>;
};

/**
 * SCHEDULE-PATTERNS-01 — с чего открывается пошаговое окно.
 *
 * Окно, открытое заново, ПРОДОЛЖАЕТ действующий график, а не начинает с нуля:
 * раньше из графика брались только вид, дни недели и часы, поэтому правка
 * одних часов молча сдвигала «2 через 2» на сегодня (первый рабочий день
 * сбрасывался), чередование недель сбрасывалось к Пн–Пт в обеих неделях, а
 * автопродление выключалось. Найдено живой проверкой 2026-09-28.
 *
 * Автопродление по умолчанию выключено (решение владельца) — это про НОВЫЙ
 * график; у действующего окно сохраняет выбор человека.
 */
export function initialDraft(plan: SchedulePlanDto): WizardDraft {
  const current = plan.current;
  const todayKey = plan.todayKey;
  const lastKey = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  const templateOf = (id: string | null | undefined) =>
    id ? plan.templates.find((item) => item.id === id) : undefined;
  const firstId = current?.days.find((day): day is string => day !== null);
  const split = current && current.kind === "CYCLE" ? cycleWorkOff(current.days) : null;
  const preset = split ? CYCLE_PRESETS.find((item) => item.work === split.work && item.off === split.off) : undefined;
  const manual = current ? isManualPattern(current) : false;

  // Разные часы у рабочих дней действующего графика — окно открывается
  // «разными по дням» с этими часами (фиксированное время — только одинаковое).
  const distinct = new Set(current?.days.filter((day): day is string => day !== null) ?? []);
  const perDayTemplates = Array.from(distinct).map(templateOf);
  const canPerDay =
    distinct.size > 1 && perDayTemplates.every((template) => template && template.scheduleMode === "FLEXIBLE");
  const perDay: Record<string, DayHoursDraft> = {};
  if (canPerDay && current) {
    current.days.forEach((day, position) => {
      if (day) perDay[`${current.kind}:${position}`] = dayHoursFromTemplate(templateOf(day));
    });
  }

  const cycleDays = current?.cycleDays ?? 0;
  const todayPosition = current && cycleDays > 0 ? patternPosition(todayKey, current.anchorOn, cycleDays) : 0;
  // «N через M» хранится рабочими днями вперёд: позиция 0 — начало блока
  // рабочих дней. Ближайший такой день (сегодня или позже) даёт ту же
  // раскладку, что у действующего графика.
  const firstDay =
    current?.kind === "CYCLE" && split ? addDaysToDateKey(todayKey, (cycleDays - todayPosition) % cycleDays) : todayKey;
  const weeks = current?.kind === "WEEKS" ? Math.min(4, Math.max(2, Math.round(cycleDays / 7))) : 2;
  const weeksDays =
    current?.kind === "WEEKS"
      ? Array.from({ length: weeks * 7 }, (_, index) => current.days[index] !== null && current.days[index] !== undefined)
      : [...WORKDAYS_MASK, ...WORKDAYS_MASK];
  // Неделя 1 начинается с даты отсчёта (понедельник) — позиция сегодня / 7.
  const currentWeek = current?.kind === "WEEKS" ? Math.floor(todayPosition / 7) + 1 : 1;
  const currentEnds = current?.endsOn ?? null;

  return {
    kind: manual ? "MANUAL" : (current?.kind ?? "WEEK"),
    weekDays: current?.kind === "WEEK" ? current.days.map((day) => day !== null) : WORKDAYS_MASK.slice(),
    cyclePreset: preset ? preset.id : split ? "custom" : "2x2",
    work: split?.work ?? 2,
    off: split?.off ?? 2,
    firstDay,
    weeksCount: weeks,
    weeksDays,
    currentWeek,
    autoExtend: current ? currentEnds === null : false,
    endsOn: currentEnds && currentEnds >= todayKey && currentEnds <= lastKey ? currentEnds : lastKey,
    hoursMode: canPerDay ? "perDay" : "same",
    sameHours: dayHoursFromTemplate(templateOf(firstId) ?? plan.templates.find((item) => item.inPalette)),
    perDay,
  };
}
