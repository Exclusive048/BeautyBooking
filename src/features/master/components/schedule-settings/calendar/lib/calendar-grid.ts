import type { CalendarDayDto, CalendarPaintAction, ScheduleDayColorKey } from "@/lib/schedule/calendar-shared";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — раскладка календаря и оптимистичная покраска.
 * Чистые функции: без React, без запросов (тестируются отдельно).
 */

export type MonthGrid = {
  /** `YYYY-MM`. */
  key: string;
  year: number;
  /** 1…12. */
  month: number;
  /** Недели с понедельника; `null` — клетка до первого или после последнего дня месяца. */
  cells: Array<CalendarDayDto | null>;
};

function weekdayMondayFirst(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

/** Дни календаря (подряд, с первого числа) → месяцы сеткой «Пн…Вс». */
export function buildMonthGrids(days: readonly CalendarDayDto[]): MonthGrid[] {
  const months: MonthGrid[] = [];
  for (const day of days) {
    const key = day.date.slice(0, 7);
    let grid = months[months.length - 1];
    if (!grid || grid.key !== key) {
      grid = {
        key,
        year: Number(key.slice(0, 4)),
        month: Number(key.slice(5, 7)),
        cells: Array.from({ length: weekdayMondayFirst(day.date) }, () => null),
      };
      months.push(grid);
    }
    grid.cells.push(day);
  }
  for (const grid of months) {
    while (grid.cells.length % 7 !== 0) grid.cells.push(null);
  }
  return months;
}

/**
 * Как день выглядит, пока покраска летит на сервер. Точный ответ (в том числе
 * «совпало с графиком — правка снята») приходит с сервером; до тех пор день
 * показывает то, что выбрал человек.
 */
export function applyPaintOptimistic(
  day: CalendarDayDto,
  action: CalendarPaintAction,
  template: { startTime: string; endTime: string; fixed: boolean } | null,
): CalendarDayDto {
  if (action.kind === "template") {
    return {
      ...day,
      isWorking: true,
      templateId: action.templateId,
      start: template?.startTime ?? day.start,
      end: template?.endTime ?? day.end,
      fixed: template?.fixed ?? false,
      painted: true,
    };
  }
  if (action.kind === "off") {
    return { ...day, isWorking: false, templateId: null, start: null, end: null, fixed: false, painted: true };
  }
  if (action.kind === "hours") {
    return {
      ...day,
      isWorking: true,
      templateId: null,
      start: action.startTime,
      end: action.endTime,
      fixed: false,
      painted: true,
    };
  }
  // «Как по графику»: каким станет день, знает только сервер.
  return { ...day, painted: false };
}

/** «09:00» → «9», «09:30» → «9:30» — подпись часов в клетке. */
export function compactHour(time: string | null): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const hour = String(Number(hours));
  return minutes === "00" ? hour : `${hour}:${minutes}`;
}

/** Сколько записей осталось на днях, которые стали выходными. */
export function bookingsOnDaysOff(days: readonly CalendarDayDto[], dates: ReadonlySet<string>): number {
  return days.filter((day) => dates.has(day.date) && !day.isWorking).reduce((sum, day) => sum + day.bookings, 0);
}

/** Заливка цветом палитры — статически, иначе Tailwind класс не соберёт. */
export const DAY_COLOR_FILL: Record<ScheduleDayColorKey, string> = {
  "1": "bg-schedule-day-1",
  "2": "bg-schedule-day-2",
  "3": "bg-schedule-day-3",
  "4": "bg-schedule-day-4",
  "5": "bg-schedule-day-5",
  "6": "bg-schedule-day-6",
};
