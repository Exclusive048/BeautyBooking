/**
 * MOBILE-STUDIO-C (ops) — ячейка «мастер × день» недели студии по НАСТОЯЩЕМУ
 * графику (план дня движка, `loadDayPlans`), а не по эвристике веба «5 записей
 * = 100%».
 *
 *  - выходной — мастер недоступен (приглашён / на паузе) или движок считает
 *    день нерабочим (неделя, «Особый день», отпуск, горизонт);
 *  - ёмкость — рабочие минуты минус перерывы графика (`dayPlanWorkMinutes`);
 *    у дня «Фиксированное время» ёмкость в минутах бессмысленна (`null`),
 *    там загрузка — доля занятых фиксированных начал;
 *  - загрузка — целые проценты, не больше 100.
 *
 * Чистая функция: вход уже посчитан вызывающим из плана дня.
 */

export type StudioWeekCell = {
  date: string;
  isDayOff: boolean;
  booked: number;
  bookedMinutes: number;
  capacityMinutes: number | null;
  fixedSlots: number | null;
  percent: number;
};

export function buildStudioWeekCell(input: {
  date: string;
  /** Мастер может принимать записи (`isStudioMasterActive`). */
  active: boolean;
  /** `plan.isWorking`; `undefined` — плана нет (нет графика / мастер не активен). */
  isWorking: boolean | undefined;
  /** `dayPlanWorkMinutes(plan)`: `null` — день «Фиксированное время». */
  workMinutes: number | null;
  /** `plan.fixedStarts?.length` — число фиксированных начал. */
  fixedStartsCount: number | null;
  booked: number;
  bookedMinutes: number;
}): StudioWeekCell {
  const isDayOff = !input.active || input.isWorking !== true;
  const fixedSlots = !isDayOff && input.workMinutes === null ? input.fixedStartsCount ?? 0 : null;
  const capacityMinutes = isDayOff ? 0 : fixedSlots !== null ? null : Math.max(0, input.workMinutes ?? 0);

  let percent = 0;
  if (fixedSlots !== null) {
    percent = fixedSlots > 0 ? Math.round((input.booked / fixedSlots) * 100) : 0;
  } else if (capacityMinutes !== null && capacityMinutes > 0) {
    percent = Math.round((input.bookedMinutes / capacityMinutes) * 100);
  }

  return {
    date: input.date,
    isDayOff,
    booked: input.booked,
    bookedMinutes: input.bookedMinutes,
    capacityMinutes,
    fixedSlots,
    percent: Math.min(Math.max(percent, 0), 100),
  };
}
