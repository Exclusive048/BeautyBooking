import "server-only";

import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { normalizeExceptionInput } from "@/lib/schedule/editor-shared";
import { PALETTE_LABEL_MAX, SCHEDULE_DAY_COLOR_KEYS } from "@/lib/schedule/calendar-shared";
import type { DayTemplateDefinition } from "@/lib/schedule/patterns-core";
import { MAX_PATTERN_CYCLE_DAYS, type SchedulePatternDto } from "@/lib/schedule/patterns-shared";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — тело запроса пошагового окна «Настроить
 * график»: рабочие дни (палитра этого графика) и сам график, позиции которого
 * ссылаются на рабочие дни по индексу. Общее для применения (`PUT /pattern`)
 * и предпросмотра (`POST /pattern/preview`).
 */

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const dayTemplateSchema = z.object({
  /**
   * SCHEDULE-PATTERNS-01 (этап 3): имя и цвет в палитре. С именем день
   * становится днём палитры («Рабочий день» ручного режима) и не удаляется,
   * когда на него перестают ссылаться; без имени — день редактора (подпись часами).
   */
  label: z.string().trim().min(1).max(PALETTE_LABEL_MAX).optional(),
  color: z.enum(SCHEDULE_DAY_COLOR_KEYS).optional(),
  startTime: TIME,
  endTime: TIME,
  breaks: z
    .array(z.object({ start: TIME, end: TIME, title: z.string().max(40).nullable().optional() }))
    .max(6)
    .default([]),
  scheduleMode: z.enum(["FLEXIBLE", "FIXED"]),
  fixedSlotTimes: z.array(TIME).max(48).default([]),
});

export const patternRequestSchema = z.object({
  // Разные часы по дням (этап 3): до одного рабочего дня на позицию графика.
  // Ни одного — ручной режим без палитры (дни отмечаются в календаре).
  templates: z.array(dayTemplateSchema).max(MAX_PATTERN_CYCLE_DAYS),
  pattern: z.object({
    kind: z.enum(["WEEK", "WEEKS", "CYCLE"]),
    cycleDays: z.number().int().min(1).max(MAX_PATTERN_CYCLE_DAYS),
    anchorOn: DATE,
    startsOn: DATE,
    endsOn: DATE.nullable(),
    days: z.array(z.number().int().min(0).nullable()).min(1).max(MAX_PATTERN_CYCLE_DAYS),
    /**
     * Что после `endsOn`: `false` (умолчание) — ничего, расписание кончается
     * там, где настроено (решение владельца); `true` — вернуть прежний график.
     */
    resumePrevious: z.boolean().default(false),
  }),
});

export type PatternRequest = z.infer<typeof patternRequestSchema>;

/**
 * Рабочие дни запроса — через тот же нормализатор, что и «Особые дни»
 * (часы, перерывы внутри дня, времена приёма), чтобы у палитры и у
 * исключений не было двух правил проверки времени.
 */
export function normalizeRequestTemplates(request: PatternRequest): DayTemplateDefinition[] {
  return request.templates.map((template) => normalizeDayTemplateInput(template));
}

/** Один рабочий день палитры: то же правило, что у окна и у «Особых дней». */
export function normalizeDayTemplateInput(template: {
  startTime: string;
  endTime: string;
  breaks: Array<{ start: string; end: string; title?: string | null }>;
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotTimes: string[];
}): DayTemplateDefinition {
  if (template.scheduleMode === "FIXED" && template.fixedSlotTimes.length === 0) {
    throw new AppError("Добавьте хотя бы одно время приёма.", 400, "SCHEDULE_PATTERN_INVALID");
  }
  const normalized = normalizeExceptionInput({
    date: "2000-01-01",
    isWorkday: true,
    scheduleMode: template.scheduleMode,
    startTime: template.startTime,
    endTime: template.endTime,
    breaks: template.breaks,
    fixedSlotTimes: template.fixedSlotTimes,
  });
  return {
    startTime: normalized.startTime ?? template.startTime,
    endTime: normalized.endTime ?? template.endTime,
    breaks: normalized.breaks,
    scheduleMode: normalized.scheduleMode,
    fixedSlotTimes: normalized.fixedSlotTimes,
  };
}

/** Позиции графика — индексы рабочих дней строкой (`"0"`, `"1"`…), выходной — `null`. */
export function patternWithTemplateRefs(request: PatternRequest): SchedulePatternDto & { startsOn: string } {
  for (const index of request.pattern.days) {
    if (index !== null && index >= request.templates.length) {
      throw new AppError("Проверьте дни графика.", 400, "SCHEDULE_PATTERN_INVALID");
    }
  }
  return {
    kind: request.pattern.kind,
    cycleDays: request.pattern.cycleDays,
    anchorOn: request.pattern.anchorOn,
    startsOn: request.pattern.startsOn,
    endsOn: request.pattern.endsOn,
    days: request.pattern.days.map((index) => (index === null ? null : String(index))),
  };
}
