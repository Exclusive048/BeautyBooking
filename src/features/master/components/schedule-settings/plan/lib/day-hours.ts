import type { DayTemplateDto, ScheduleModeValue } from "@/lib/schedule/patterns-shared";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — черновик часов рабочего дня в кабинете:
 * пошаговое окно (одинаковые или разные по дням), палитра, «свои часы» дня
 * календаря. Проверку по существу делает сервер (`normalizeDayTemplateInput`);
 * здесь — то, что нужно, чтобы не отправлять заведомо неверное.
 */

export type DayHoursDraft = {
  mode: ScheduleModeValue;
  startTime: string;
  endTime: string;
  breakOn: boolean;
  breakStart: string;
  breakEnd: string;
  fixedTimes: string[];
};

export const DEFAULT_DAY_HOURS: DayHoursDraft = {
  mode: "FLEXIBLE",
  startTime: "10:00",
  endTime: "20:00",
  breakOn: false,
  breakStart: "14:00",
  breakEnd: "15:00",
  fixedTimes: ["10:00", "13:00", "16:00"],
};

export type DayHoursError = "invalidRange" | "noFixedTimes";

export function validateDayHours(draft: DayHoursDraft): DayHoursError | null {
  if (draft.mode === "FIXED") return draft.fixedTimes.length === 0 ? "noFixedTimes" : null;
  if (draft.startTime >= draft.endTime) return "invalidRange";
  if (
    draft.breakOn &&
    (draft.breakStart <= draft.startTime || draft.breakEnd >= draft.endTime || draft.breakStart >= draft.breakEnd)
  ) {
    return "invalidRange";
  }
  return null;
}

export type DayTemplateRequest = {
  startTime: string;
  endTime: string;
  breaks: Array<{ start: string; end: string; title: null }>;
  scheduleMode: ScheduleModeValue;
  fixedSlotTimes: string[];
};

/** Черновик → рабочий день запроса (у фиксированного времени сервер держит день 00:00–23:55). */
export function dayHoursToTemplate(draft: DayHoursDraft): DayTemplateRequest {
  if (draft.mode === "FIXED") {
    return {
      startTime: "00:00",
      endTime: "23:55",
      breaks: [],
      scheduleMode: "FIXED",
      fixedSlotTimes: Array.from(new Set(draft.fixedTimes)).sort(),
    };
  }
  return {
    startTime: draft.startTime,
    endTime: draft.endTime,
    breaks: draft.breakOn ? [{ start: draft.breakStart, end: draft.breakEnd, title: null }] : [],
    scheduleMode: "FLEXIBLE",
    fixedSlotTimes: [],
  };
}

/** Рабочий день палитры → черновик (для начального состояния окна). */
export function dayHoursFromTemplate(template: DayTemplateDto | undefined): DayHoursDraft {
  if (!template) return { ...DEFAULT_DAY_HOURS };
  const firstBreak = template.breaks[0];
  if (template.scheduleMode === "FIXED") {
    return {
      ...DEFAULT_DAY_HOURS,
      mode: "FIXED",
      fixedTimes: template.fixedSlotTimes.length > 0 ? template.fixedSlotTimes : DEFAULT_DAY_HOURS.fixedTimes,
    };
  }
  return {
    ...DEFAULT_DAY_HOURS,
    mode: "FLEXIBLE",
    startTime: template.startTime,
    endTime: template.endTime,
    breakOn: Boolean(firstBreak),
    breakStart: firstBreak?.start ?? DEFAULT_DAY_HOURS.breakStart,
    breakEnd: firstBreak?.end ?? DEFAULT_DAY_HOURS.breakEnd,
  };
}

/**
 * Рабочие дни графика из часов по позициям: одинаковые часы — один рабочий
 * день, позиции ссылаются на него индексом (`null` — выходной). Порядок
 * рабочих дней — по первой позиции, поэтому запрос детерминирован.
 */
export function buildPatternTemplates(positions: ReadonlyArray<DayHoursDraft | null>): {
  templates: DayTemplateRequest[];
  days: Array<number | null>;
} {
  const templates: DayTemplateRequest[] = [];
  const indexByKey = new Map<string, number>();
  const days = positions.map((draft) => {
    if (!draft) return null;
    const template = dayHoursToTemplate(draft);
    const key = JSON.stringify(template);
    let index = indexByKey.get(key);
    if (index === undefined) {
      index = templates.length;
      templates.push(template);
      indexByKey.set(key, index);
    }
    return index;
  });
  return { templates, days };
}
