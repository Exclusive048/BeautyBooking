import type { DayTemplateDto, ScheduleModeValue } from "@/lib/schedule/patterns-shared";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — черновик часов рабочего дня в кабинете:
 * пошаговое окно (одинаковые или разные по дням), палитра, «свои часы» дня
 * календаря. Проверку по существу делает сервер (`normalizeDayTemplateInput`);
 * здесь — то, что нужно, чтобы не отправлять заведомо неверное.
 *
 * SCHEDULE-BREAKS-MANY (2026-10-29, запрос владельца): перерывов в дне сколько
 * угодно. Проверка повторяет серверную (`normalizeBreaks` в `editor-shared.ts`)
 * один в один: перерыв строго внутри дня (касание начала или конца сервер
 * молча выбрасывает — сохранённое разошлось бы с введённым), конец позже
 * начала, без пересечений (встык — можно).
 */

export type DayBreakDraft = { start: string; end: string };

export type DayHoursDraft = {
  mode: ScheduleModeValue;
  startTime: string;
  endTime: string;
  breaks: DayBreakDraft[];
  fixedTimes: string[];
};

export const DEFAULT_DAY_HOURS: DayHoursDraft = {
  mode: "FLEXIBLE",
  startTime: "10:00",
  endTime: "20:00",
  breaks: [],
  fixedTimes: ["10:00", "13:00", "16:00"],
};

export type DayHoursError = "invalidRange" | "breakOutside" | "breakOverlap" | "noFixedTimes";

export function validateDayHours(draft: DayHoursDraft): DayHoursError | null {
  if (draft.mode === "FIXED") return draft.fixedTimes.length === 0 ? "noFixedTimes" : null;
  if (draft.startTime >= draft.endTime) return "invalidRange";
  for (const item of draft.breaks) {
    if (item.start >= item.end || item.start <= draft.startTime || item.end >= draft.endTime) return "breakOutside";
  }
  const sorted = sortBreaks(draft.breaks);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.start < sorted[index - 1]!.end) return "breakOverlap";
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
    // По порядку — сервер хранит их отсортированными, и ключ одинаковых часов
    // (`buildPatternTemplates`) не должен зависеть от порядка ввода.
    breaks: sortBreaks(draft.breaks).map((item) => ({ start: item.start, end: item.end, title: null })),
    scheduleMode: "FLEXIBLE",
    fixedSlotTimes: [],
  };
}

/** Рабочий день палитры → черновик (для начального состояния окна). */
export function dayHoursFromTemplate(template: DayTemplateDto | undefined): DayHoursDraft {
  if (!template) return { ...DEFAULT_DAY_HOURS, breaks: [] };
  if (template.scheduleMode === "FIXED") {
    return {
      ...DEFAULT_DAY_HOURS,
      mode: "FIXED",
      breaks: [],
      fixedTimes: template.fixedSlotTimes.length > 0 ? template.fixedSlotTimes : DEFAULT_DAY_HOURS.fixedTimes,
    };
  }
  return {
    ...DEFAULT_DAY_HOURS,
    mode: "FLEXIBLE",
    startTime: template.startTime,
    endTime: template.endTime,
    breaks: template.breaks.map((item) => ({ start: item.start, end: item.end })),
  };
}

const FIRST_BREAK_START = 14 * 60;
const BREAK_LENGTH_MIN = 30;
const BREAK_SCAN_STEP_MIN = 15;

/**
 * Перерыв, который предлагает «Добавить перерыв»: первый — 14:00 на час (как
 * было), следующий — через час после последнего на полчаса; если не помещается —
 * первое свободное место дня. Свободного места нет — то же предложение: поле
 * покажет ошибку, человек поправит часы сам.
 */
export function suggestNextBreak(draft: DayHoursDraft): DayBreakDraft {
  const dayStart = toMinutes(draft.startTime);
  const dayEnd = toMinutes(draft.endTime);
  const sorted = sortBreaks(draft.breaks);
  const last = sorted.at(-1);
  const length = last ? BREAK_LENGTH_MIN : 60;
  const preferred = last ? toMinutes(last.end) + 60 : FIRST_BREAK_START;
  const fits = (start: number) =>
    start > dayStart &&
    start + length < dayEnd &&
    sorted.every((item) => start + length <= toMinutes(item.start) || start >= toMinutes(item.end));
  let chosen = fits(preferred) ? preferred : null;
  if (chosen === null) {
    const first = Math.ceil((dayStart + 1) / BREAK_SCAN_STEP_MIN) * BREAK_SCAN_STEP_MIN;
    for (let start = first; start + length < dayEnd; start += BREAK_SCAN_STEP_MIN) {
      if (fits(start)) {
        chosen = start;
        break;
      }
    }
  }
  const start = Math.min(chosen ?? preferred, 24 * 60 - length - 5);
  return { start: fromMinutes(start), end: fromMinutes(start + length) };
}

function sortBreaks(breaks: readonly DayBreakDraft[]): DayBreakDraft[] {
  return [...breaks].sort((left, right) => (left.start === right.start ? 0 : left.start < right.start ? -1 : 1));
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function fromMinutes(value: number): string {
  const safe = Math.max(0, Math.min(value, 24 * 60 - 1));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
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
