/**
 * Pure helpers that translate a `ScheduleChangeRequest.payloadJson` into a
 * human-readable preview structure for the approval UI. Lives client-side
 * (no Prisma/Redis), called from server components that pass plain objects
 * to the cards.
 *
 * Two payload shapes are supported:
 *   - `EDITOR_V1` (new) — `ScheduleEditorRequestPayload` from Schedule Settings
 *   - legacy `SchedulePayload` (templates + weekly + overrides) — older
 *     studio editor; still in DB for unresolved historic requests
 */

import {
  isScheduleEditorRequestPayload,
  normalizeScheduleEditorRequestPayload,
  type BreakDto,
  type DayScheduleDto,
  type EditorExceptionInput,
} from "@/lib/schedule/editor-shared";

const WEEKDAY_LABELS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

export type DayPreview = {
  weekdayLabel: string;
  isWorkday: boolean;
  mode: "FLEXIBLE" | "FIXED";
  /** Human-readable summary like "10:00–20:00" or "Выходной" or "Слоты: 10:00, 12:00, 14:00". */
  summary: string;
  breaks: string[];
};

export type ExceptionPreview = {
  date: string;
  isWorkday: boolean;
  mode: "FLEXIBLE" | "FIXED";
  summary: string;
  note: string | null;
};

export type SchedulePayloadPreview =
  | {
      format: "EDITOR_V1";
      week: DayPreview[];
      exceptions: ExceptionPreview[];
    }
  | {
      format: "LEGACY";
      /** Raw counts and a short description for legacy payloads we cannot
       * fully render. */
      summary: string;
    }
  | {
      format: "UNKNOWN";
      summary: string;
    };

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  return `${start}–${end}`;
}

function formatBreak(entry: BreakDto): string {
  const range = formatTimeRange(entry.start, entry.end);
  const title = entry.title?.trim();
  return title ? `${title} ${range}` : range;
}

function summarizeDay(day: DayScheduleDto): string {
  if (!day.isWorkday) return "Выходной";
  if (day.scheduleMode === "FIXED") {
    if (day.fixedSlotTimes.length === 0) return "Без слотов";
    const list = day.fixedSlotTimes.slice(0, 6).join(", ");
    const rest = day.fixedSlotTimes.length - 6;
    return rest > 0 ? `Слоты: ${list} +${rest}` : `Слоты: ${list}`;
  }
  return formatTimeRange(day.startTime, day.endTime) || "—";
}

function summarizeException(entry: EditorExceptionInput): string {
  if (!entry.isWorkday) return "Выходной";
  if (entry.scheduleMode === "FIXED") {
    if (entry.fixedSlotTimes.length === 0) return "Без слотов";
    const list = entry.fixedSlotTimes.slice(0, 6).join(", ");
    const rest = entry.fixedSlotTimes.length - 6;
    return rest > 0 ? `Слоты: ${list} +${rest}` : `Слоты: ${list}`;
  }
  return formatTimeRange(entry.startTime, entry.endTime) || "—";
}

function isLegacySchedulePayload(value: unknown): value is {
  templates?: unknown[];
  weekly?: { days?: unknown[] };
  overrides?: unknown[];
} {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.templates) ||
    (typeof obj.weekly === "object" && obj.weekly !== null) ||
    Array.isArray(obj.overrides)
  );
}

export function buildSchedulePayloadPreview(payload: unknown): SchedulePayloadPreview {
  if (isScheduleEditorRequestPayload(payload)) {
    const normalized = normalizeScheduleEditorRequestPayload(payload);
    const week: DayPreview[] = normalized.weekSchedule.map((day) => ({
      weekdayLabel: WEEKDAY_LABELS_RU[day.dayOfWeek] ?? "—",
      isWorkday: day.isWorkday,
      mode: day.scheduleMode,
      summary: summarizeDay(day),
      breaks: day.breaks.map(formatBreak),
    }));
    const exceptions: ExceptionPreview[] = normalized.exceptions.map((entry) => ({
      date: entry.date,
      isWorkday: entry.isWorkday,
      mode: entry.scheduleMode,
      summary: summarizeException(entry),
      note: entry.note,
    }));
    return { format: "EDITOR_V1", week, exceptions };
  }

  if (isLegacySchedulePayload(payload)) {
    const obj = payload as {
      templates?: unknown[];
      weekly?: { days?: unknown[] };
      overrides?: unknown[];
    };
    const templates = Array.isArray(obj.templates) ? obj.templates.length : 0;
    const weeklyDays = Array.isArray(obj.weekly?.days) ? obj.weekly!.days!.length : 0;
    const overrides = Array.isArray(obj.overrides) ? obj.overrides.length : 0;
    const parts: string[] = [];
    if (templates > 0) parts.push(`Шаблонов: ${templates}`);
    if (weeklyDays > 0) parts.push(`Дней в неделе: ${weeklyDays}`);
    if (overrides > 0) parts.push(`Исключений: ${overrides}`);
    return {
      format: "LEGACY",
      summary: parts.length > 0 ? parts.join(" · ") : "Изменения расписания",
    };
  }

  return { format: "UNKNOWN", summary: "Изменения расписания" };
}
