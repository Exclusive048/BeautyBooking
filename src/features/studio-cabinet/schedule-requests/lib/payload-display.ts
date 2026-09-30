/**
 * Pure helpers that translate a `ScheduleChangeRequest.payloadJson` into a
 * human-readable preview structure for the approval UI. Lives client-side
 * (no Prisma/Redis), called from server components that pass plain objects
 * to the cards.
 *
 * Payload shapes:
 *   - `CHANGES_V1` — копящаяся заявка (SCHEDULE-STUDIO-PROFILE-CALENDAR):
 *     новая неделя или график + правки дней календаря
 *   - `PATTERN_V1` — график из пошагового окна (этап 4, до CHANGES_V1)
 *   - `EDITOR_V1` — `ScheduleEditorRequestPayload` from Schedule Settings
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
import {
  isPatternChangeRequestPayload,
  type DayTemplateDto,
  type PatternChangeRequestBody,
} from "@/lib/schedule/patterns-shared";
import {
  isScheduleChangesPayload,
  type ReviewDayState,
  type ScheduleRequestReview,
} from "@/lib/schedule/schedule-changes-shared";
import { summarizePattern } from "@/features/master/components/schedule-settings/plan/lib/describe-plan";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

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

type PatternPreview = { summary: string; period: string; days: string[] };

export type SchedulePayloadPreview =
  | {
      /** Копящаяся заявка: неделя или график (не оба) и число правок дней. */
      format: "CHANGES_V1";
      pattern: PatternPreview | null;
      week: DayPreview[] | null;
      dayCount: number;
    }
  | {
      format: "EDITOR_V1";
      week: DayPreview[];
      exceptions: ExceptionPreview[];
    }
  | {
      /** SCHEDULE-PATTERNS-01 (этап 4): заявка в формате графика из пошагового окна. */
      format: "PATTERN_V1";
      summary: string;
      period: string;
      days: string[];
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
    if (day.fixedSlotTimes.length === 0) return "Без окошек";
    const list = day.fixedSlotTimes.slice(0, 6).join(", ");
    const rest = day.fixedSlotTimes.length - 6;
    return rest > 0 ? `Окошки: ${list} +${rest}` : `Окошки: ${list}`;
  }
  return formatTimeRange(day.startTime, day.endTime) || "—";
}

function summarizeException(entry: EditorExceptionInput): string {
  if (!entry.isWorkday) return "Выходной";
  if (entry.scheduleMode === "FIXED") {
    if (entry.fixedSlotTimes.length === 0) return "Без окошек";
    const list = entry.fixedSlotTimes.slice(0, 6).join(", ");
    const rest = entry.fixedSlotTimes.length - 6;
    return rest > 0 ? `Окошки: ${list} +${rest}` : `Окошки: ${list}`;
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

function dateKeyLabel(dateKey: string): string {
  // Дата салона — календарная дата без пояса: подпись в UTC полудня.
  return UI_FMT.dateShort(`${dateKey}T12:00:00.000Z`, { timeZone: "UTC" });
}

function buildPatternPreview(payload: { request: PatternChangeRequestBody }): PatternPreview {
  const { templates, pattern } = payload.request;
  const review = UI_TEXT.cabinetMaster.scheduleSettings.wizard.review;
  const dtos: DayTemplateDto[] = templates.map((template, index) => ({
    id: String(index),
    name: template.label ?? null,
    color: "1",
    startTime: template.startTime,
    endTime: template.endTime,
    breaks: template.breaks.map((item) => ({ start: item.start, end: item.end, title: item.title ?? null })),
    scheduleMode: template.scheduleMode,
    fixedSlotTimes: template.fixedSlotTimes,
    inPalette: true,
    inUse: false,
  }));
  const summary = summarizePattern(
    {
      kind: pattern.kind,
      cycleDays: pattern.cycleDays,
      anchorOn: pattern.anchorOn,
      startsOn: pattern.startsOn,
      endsOn: pattern.endsOn,
      days: pattern.days.map((day) => (day === null ? null : String(day))),
    },
    dtos,
  );
  const period = [
    review.fromLabel(dateKeyLabel(pattern.startsOn)),
    pattern.endsOn ? review.untilLabel(dateKeyLabel(pattern.endsOn)) : review.autoExtendNote,
    pattern.endsOn && pattern.resumePrevious ? review.resumeNote : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const days = templates.map((template) => {
    const name = template.label ? `${template.label}: ` : "";
    if (template.scheduleMode === "FIXED") {
      return `${name}${summarizeDay({
        dayOfWeek: 0,
        isWorkday: true,
        scheduleMode: "FIXED",
        startTime: template.startTime,
        endTime: template.endTime,
        breaks: [],
        fixedSlotTimes: template.fixedSlotTimes,
      })}`;
    }
    const breaks = template.breaks.map((item) => formatBreak({ ...item, title: item.title ?? null }));
    return `${name}${formatTimeRange(template.startTime, template.endTime)}${breaks.length > 0 ? ` (${breaks.join(", ")})` : ""}`;
  });
  return { summary, period, days };
}

function buildWeekPreview(week: DayScheduleDto[]): DayPreview[] {
  return week.map((day) => ({
    weekdayLabel: WEEKDAY_LABELS_RU[day.dayOfWeek] ?? "—",
    isWorkday: day.isWorkday,
    mode: day.scheduleMode,
    summary: summarizeDay(day),
    breaks: day.breaks.map(formatBreak),
  }));
}

export function buildSchedulePayloadPreview(payload: unknown): SchedulePayloadPreview {
  if (isScheduleChangesPayload(payload)) {
    return {
      format: "CHANGES_V1",
      pattern: payload.pattern ? buildPatternPreview({ request: payload.pattern }) : null,
      week: payload.week ? buildWeekPreview(payload.week) : null,
      dayCount: payload.days.length,
    };
  }
  if (isPatternChangeRequestPayload(payload)) return { format: "PATTERN_V1", ...buildPatternPreview(payload) };
  if (isScheduleEditorRequestPayload(payload)) {
    const normalized = normalizeScheduleEditorRequestPayload(payload);
    const week = buildWeekPreview(normalized.weekSchedule);
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
    if (templates > 0) parts.push(`Шаблонов графика: ${templates}`);
    if (weeklyDays > 0) parts.push(`Дней в неделе: ${weeklyDays}`);
    if (overrides > 0) parts.push(`Особых дней: ${overrides}`);
    return {
      format: "LEGACY",
      summary: parts.length > 0 ? parts.join(" · ") : "Изменения расписания",
    };
  }

  return { format: "UNKNOWN", summary: "Изменения расписания" };
}

// ─── «Было / стало» (SCHEDULE-STUDIO-PROFILE-CALENDAR) ──────────────────────

export type ReviewPreview = {
  /** Сводка графика, действующего сейчас; `null` — у профиля графика нет. */
  current: string | null;
  days: Array<{ date: string; before: string; after: string }>;
};

function describeReviewDay(state: ReviewDayState | null): string {
  const P = UI_TEXT.studioCabinet.scheduleRequests.preview;
  if (!state) return P.byPattern;
  if (!state.isWorking) return P.dayOff;
  const hours = state.fixed ? P.fixedTime : formatTimeRange(state.start, state.end) || "—";
  return state.name ? `${state.name} · ${hours}` : hours;
}

/** Что студия видит поверх тела заявки: график сейчас и дни «было → стало». */
export function buildReviewPreview(review: ScheduleRequestReview): ReviewPreview {
  return {
    current: review.currentPattern ? summarizePattern(review.currentPattern, review.currentTemplates) : null,
    days: review.days.map((day) => ({
      date: dateKeyLabel(day.date),
      before: describeReviewDay(day.before),
      after: describeReviewDay(day.after),
    })),
  };
}
