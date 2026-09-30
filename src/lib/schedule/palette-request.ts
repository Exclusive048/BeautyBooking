import { z } from "zod";
import { PALETTE_LABEL_MAX, SCHEDULE_DAY_COLOR_KEYS } from "@/lib/schedule/calendar-shared";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — тела запросов палитры рабочих дней
 * (`/api/cabinet/master/schedule/palette`). Часы проверяет тот же нормализатор,
 * что у пошагового окна и «Особых дней» (`normalizeDayTemplateInput`).
 */

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const paletteDaySchema = z.object({
  label: z.string().trim().min(1).max(PALETTE_LABEL_MAX),
  color: z.enum(SCHEDULE_DAY_COLOR_KEYS),
  startTime: TIME,
  endTime: TIME,
  breaks: z
    .array(z.object({ start: TIME, end: TIME, title: z.string().max(40).nullable().optional() }))
    .max(6)
    .default([]),
  scheduleMode: z.enum(["FLEXIBLE", "FIXED"]),
  fixedSlotTimes: z.array(TIME).max(48).default([]),
});

/** Имя и цвет существующего дня. Часы не меняются: другие часы — новый рабочий день. */
export const paletteDayPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(PALETTE_LABEL_MAX).optional(),
    color: z.enum(SCHEDULE_DAY_COLOR_KEYS).optional(),
  })
  .refine((value) => value.label !== undefined || value.color !== undefined);
