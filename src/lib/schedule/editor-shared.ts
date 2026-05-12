/**
 * Client-safe types, constants, and pure helpers for the schedule editor.
 *
 * This module is the boundary between the server-only `editor.ts`
 * (Prisma + Redis cache invalidation) and the client tabs in
 * `src/features/master/components/schedule-settings/`. Everything that
 * runs in a browser bundle MUST import from here, not from `editor.ts`.
 *
 * Why: `editor.ts` transitively imports `@/lib/schedule/slotsCache` →
 * `@/lib/cache/redisClient` → Node's `net`. Webpack happily walks the
 * graph of any non-`import type` reference, so a single runtime import
 * (e.g. `SLOT_STEP_OPTIONS`) from a client component would drag the
 * Redis client into the browser bundle and fail the build.
 *
 * Stays here:
 *   - All exported types (DTOs, snapshot, input shapes)
 *   - Constants used by the UI (SLOT_STEP_OPTIONS, BUFFER_OPTIONS, ...)
 *   - Pure normalizers / serializers — no Prisma, no Redis
 *
 * Stays in `editor.ts`:
 *   - `buildScheduleSnapshot`, `applyScheduleSnapshot` (Prisma + cache)
 *   - Their internal write helpers (saveWeekSchedule, saveException, ...)
 *
 * `editor.ts` re-exports everything below so existing server callers
 * (API routes, legacy studio editor) keep working without import edits.
 */

import { AppError } from "@/lib/api/errors";
import {
  HOT_SLOT_PERCENT_VALUES,
  HOT_SLOT_TRIGGER_HOURS,
} from "@/lib/hot-slots/constants";
import { parseDateKeyParts } from "@/lib/schedule/dateKey";

export type BreakDto = {
  start: string;
  end: string;
  /** Optional title persisted on `ScheduleTemplateBreak.title` ("Обед",
   * "Кофе-пауза"). Surfaced primarily by the Breaks tab; Hours-tab leaves
   * it null. UI falls back to a generic label when null. */
  title?: string | null;
};

export type DayScheduleDto = {
  dayOfWeek: number; // 0=Mon ... 6=Sun
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string;
  endTime: string;
  breaks: BreakDto[];
  fixedSlotTimes: string[];
};

export type ScheduleExceptionDto = {
  id: string;
  date: string; // YYYY-MM-DD
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string | null;
  endTime: string | null;
  breaks: BreakDto[];
  fixedSlotTimes: string[];
  /** Optional human-friendly label persisted on `ScheduleOverride.note`.
   * Used for grouping consecutive same-attribute days into a single card
   * in the Exceptions tab ("Майские праздники"). */
  note: string | null;
};

export type WeekTemplateDto = {
  id: "standard" | "2x2";
  label: string;
};

/**
 * What to do when a client cancels later than `freeCancelHours`.
 *
 * - `none` — no consequence.
 * - `reminder` — surface the cancellation policy in the next reminder push.
 * - `fine` — flag the client in CRM as a frequent canceller (UI label
 *   "отметить в CRM"). **Despite the name, no actual fine is charged** —
 *   online payments are not yet wired for cancellation fees. Stored in DB
 *   as `"fine"` for forward-compat; UI says CRM tracking. CRM-flagging
 *   itself is a backlog feature.
 */
export type LateCancelAction = "none" | "reminder" | "fine";
export type SlotPrecision = "exact" | "today_free" | "date_only";
export type HotSlotApplyMode = "ALL_SERVICES" | "PRICE_FROM" | "MANUAL";

export type BookingRulesDto = {
  minHoursAhead: number;
  maxDaysAhead: number;
  autoConfirm: boolean;
  /** null = no deadline; reuse of `Provider.cancellationDeadlineHours`. */
  freeCancelHours: number | null;
  lateCancelAction: LateCancelAction;
};

export type VisibilityDto = {
  isPublished: boolean;
  slotPrecision: SlotPrecision;
  visibleSlotDays: number;
  acceptNewClients: boolean;
};

export type HotSlotsDto = {
  triggerHours: number;
  discountValue: number;
  applyMode: HotSlotApplyMode;
};

export type ScheduleEditorSnapshot = {
  timezone: string;
  slotStepMin: number;
  /** Provider-level setting surfaced in the Breaks tab. Reuse of
   * `Provider.bufferBetweenBookingsMin` — no schema addition. */
  bufferBetweenBookingsMin: number;
  weekSchedule: DayScheduleDto[];
  exceptions: ScheduleExceptionDto[];
  templates: WeekTemplateDto[];
  bookingRules: BookingRulesDto;
  visibility: VisibilityDto;
  /** null when DiscountRule absent or `isEnabled: false`. */
  hotSlots: HotSlotsDto | null;
};

export type ScheduleEditorRequestPayload = {
  format: "EDITOR_V1";
  weekSchedule: DayScheduleDto[];
  exceptions: EditorExceptionInput[];
};

export type NormalizedScheduleState = {
  weekSchedule: DayScheduleDto[];
  exceptions: EditorExceptionInput[];
};

export type EditorExceptionInput = {
  date: string;
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string | null;
  endTime: string | null;
  breaks: BreakDto[];
  fixedSlotTimes: string[];
  /** Persisted on `ScheduleOverride.note`. */
  note: string | null;
};

export const AUTO_TEMPLATE_PREFIX = "__editor_auto_";
const DEFAULT_FLEX_START = "09:00";
const DEFAULT_FLEX_END = "20:00";
export const FIXED_RANGE_START = "00:00";
export const FIXED_RANGE_END = "23:55";

export const WEEK_TEMPLATE_OPTIONS: WeekTemplateDto[] = [
  { id: "standard", label: "Стандартная пятидневка" },
  { id: "2x2", label: "2 через 2" },
];

const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30] as const;
export type BufferMin = (typeof BUFFER_OPTIONS)[number];

export function normalizeBufferMin(value: unknown): BufferMin {
  if (typeof value !== "number" || !Number.isInteger(value)) return 0;
  return (BUFFER_OPTIONS as readonly number[]).includes(value) ? (value as BufferMin) : 0;
}

export const SLOT_STEP_OPTIONS = [15, 30, 60] as const;
export type SlotStepMin = (typeof SLOT_STEP_OPTIONS)[number];

export function normalizeSlotStepMin(value: unknown): SlotStepMin {
  if (typeof value !== "number" || !Number.isInteger(value)) return 15;
  return (SLOT_STEP_OPTIONS as readonly number[]).includes(value)
    ? (value as SlotStepMin)
    : 15;
}

const LATE_CANCEL_ACTIONS: readonly LateCancelAction[] = ["none", "reminder", "fine"];
const SLOT_PRECISIONS: readonly SlotPrecision[] = ["exact", "today_free", "date_only"];
const HOT_SLOT_APPLY_MODES: readonly HotSlotApplyMode[] = [
  "ALL_SERVICES",
  "PRICE_FROM",
  "MANUAL",
];

const MIN_HOURS_AHEAD_OPTIONS = [0, 1, 2, 4, 6, 12, 24, 48] as const;
const MAX_DAYS_AHEAD_OPTIONS = [7, 14, 30, 60, 90, 180] as const;
const FREE_CANCEL_HOURS_OPTIONS = [1, 2, 4, 12, 24, 48] as const;
const VISIBLE_SLOT_DAY_OPTIONS = [3, 7, 14, 30, 60] as const;

function clampToSet<T extends number>(value: unknown, options: readonly T[], fallback: T): T {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return options.includes(value as T) ? (value as T) : fallback;
}

export function normalizeBookingRules(
  value: unknown,
  defaults: BookingRulesDto
): BookingRulesDto {
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  const minHoursAhead = clampToSet(
    record.minHoursAhead,
    MIN_HOURS_AHEAD_OPTIONS,
    defaults.minHoursAhead as 0 | 1 | 2 | 4 | 6 | 12 | 24 | 48
  );
  const maxDaysAhead = clampToSet(
    record.maxDaysAhead,
    MAX_DAYS_AHEAD_OPTIONS,
    defaults.maxDaysAhead as 7 | 14 | 30 | 60 | 90 | 180
  );
  const autoConfirm =
    typeof record.autoConfirm === "boolean" ? record.autoConfirm : defaults.autoConfirm;
  const lateCancelRaw = record.lateCancelAction;
  const lateCancelAction =
    typeof lateCancelRaw === "string" &&
    LATE_CANCEL_ACTIONS.includes(lateCancelRaw as LateCancelAction)
      ? (lateCancelRaw as LateCancelAction)
      : defaults.lateCancelAction;

  let freeCancelHours: number | null = defaults.freeCancelHours;
  if (record.freeCancelHours === null) {
    freeCancelHours = null;
  } else if (
    typeof record.freeCancelHours === "number" &&
    Number.isInteger(record.freeCancelHours)
  ) {
    freeCancelHours = (FREE_CANCEL_HOURS_OPTIONS as readonly number[]).includes(
      record.freeCancelHours
    )
      ? record.freeCancelHours
      : defaults.freeCancelHours;
  }

  return { minHoursAhead, maxDaysAhead, autoConfirm, freeCancelHours, lateCancelAction };
}

export function normalizeVisibility(
  value: unknown,
  defaults: VisibilityDto
): VisibilityDto {
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  const isPublished =
    typeof record.isPublished === "boolean" ? record.isPublished : defaults.isPublished;
  const acceptNewClients =
    typeof record.acceptNewClients === "boolean"
      ? record.acceptNewClients
      : defaults.acceptNewClients;
  const precisionRaw = record.slotPrecision;
  const slotPrecision =
    typeof precisionRaw === "string" && SLOT_PRECISIONS.includes(precisionRaw as SlotPrecision)
      ? (precisionRaw as SlotPrecision)
      : defaults.slotPrecision;
  const visibleSlotDays = clampToSet(
    record.visibleSlotDays,
    VISIBLE_SLOT_DAY_OPTIONS,
    defaults.visibleSlotDays as 3 | 7 | 14 | 30 | 60
  );

  return { isPublished, slotPrecision, visibleSlotDays, acceptNewClients };
}

export function normalizeHotSlots(value: unknown): HotSlotsDto | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const triggerRaw = typeof record.triggerHours === "number" ? record.triggerHours : null;
  const triggerHours =
    triggerRaw !== null && (HOT_SLOT_TRIGGER_HOURS as readonly number[]).includes(triggerRaw)
      ? triggerRaw
      : 3;
  const discountRaw =
    typeof record.discountValue === "number" ? record.discountValue : null;
  const discountValue =
    discountRaw !== null && (HOT_SLOT_PERCENT_VALUES as readonly number[]).includes(discountRaw)
      ? discountRaw
      : 20;
  const applyRaw = record.applyMode;
  const applyMode =
    typeof applyRaw === "string" &&
    HOT_SLOT_APPLY_MODES.includes(applyRaw as HotSlotApplyMode)
      ? (applyRaw as HotSlotApplyMode)
      : "ALL_SERVICES";
  return { triggerHours, discountValue, applyMode };
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute % 5 !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hourRaw, minuteRaw] = value.split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

export function normalizeFixedSlotTimes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeTime(value);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function normalizeBreaks(values: unknown, startTime: string, endTime: string): BreakDto[] {
  if (!Array.isArray(values)) return [];
  const startLimit = timeToMinutes(startTime);
  const endLimit = timeToMinutes(endTime);
  const rows = values
    .map((value) => {
      if (!value || typeof value !== "object") return null;
      const row = value as Record<string, unknown>;
      const start = normalizeTime(row.start);
      const end = normalizeTime(row.end);
      if (!start || !end) return null;
      const startMinutes = timeToMinutes(start);
      const endMinutes = timeToMinutes(end);
      if (startMinutes >= endMinutes) return null;
      if (startMinutes <= startLimit || endMinutes >= endLimit) return null;
      const titleRaw = typeof row.title === "string" ? row.title.trim() : "";
      const title = titleRaw.length > 0 ? titleRaw.slice(0, 60) : null;
      return { start, end, startMinutes, endMinutes, title };
    })
    .filter(
      (
        value
      ): value is {
        start: string;
        end: string;
        startMinutes: number;
        endMinutes: number;
        title: string | null;
      } => Boolean(value)
    )
    .sort((left, right) => left.startMinutes - right.startMinutes);

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].startMinutes < rows[index - 1].endMinutes) {
      throw new AppError("Breaks overlap", 400, "BREAK_OVERLAP");
    }
  }
  return rows.map((row) => ({ start: row.start, end: row.end, title: row.title }));
}

export function parseDateKeyToUtcStart(dateKey: string): Date {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) {
    throw new AppError("Invalid date", 400, "DATE_INVALID");
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

function parseScheduleMode(value: unknown): "FLEXIBLE" | "FIXED" {
  return value === "FIXED" ? "FIXED" : "FLEXIBLE";
}

export function buildDefaultWeekSchedule(): DayScheduleDto[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isWorkday: dayOfWeek <= 4,
    scheduleMode: "FLEXIBLE" as const,
    startTime: DEFAULT_FLEX_START,
    endTime: DEFAULT_FLEX_END,
    breaks: [],
    fixedSlotTimes: [],
  }));
}

export function normalizeWeekScheduleInput(value: unknown): DayScheduleDto[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError("Invalid body", 400, "INVALID_BODY");
  }

  const byDay = new Map<number, DayScheduleDto>();
  for (const row of value) {
    if (!row || typeof row !== "object") {
      throw new AppError("Invalid body", 400, "INVALID_BODY");
    }

    const record = row as Record<string, unknown>;
    const dayOfWeekRaw = record.dayOfWeek;
    if (
      typeof dayOfWeekRaw !== "number" ||
      !Number.isInteger(dayOfWeekRaw) ||
      dayOfWeekRaw < 0 ||
      dayOfWeekRaw > 6
    ) {
      throw new AppError("Invalid day of week", 400, "DAY_INVALID");
    }
    const dayOfWeek = dayOfWeekRaw as number;
    if (byDay.has(dayOfWeek)) {
      throw new AppError("Duplicate day", 400, "VALIDATION_ERROR");
    }

    const scheduleMode = parseScheduleMode(record.scheduleMode);
    const isWorkday = Boolean(record.isWorkday);
    const fixedSlotTimes = normalizeFixedSlotTimes(record.fixedSlotTimes);
    const fallbackStart = scheduleMode === "FIXED" ? FIXED_RANGE_START : DEFAULT_FLEX_START;
    const fallbackEnd = scheduleMode === "FIXED" ? FIXED_RANGE_END : DEFAULT_FLEX_END;
    const startTime = normalizeTime(record.startTime) ?? fallbackStart;
    const endTime = normalizeTime(record.endTime) ?? fallbackEnd;
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new AppError("Invalid time range", 400, "TIME_RANGE_INVALID");
    }
    const breaks =
      isWorkday && scheduleMode === "FLEXIBLE"
        ? normalizeBreaks(record.breaks, startTime, endTime)
        : [];

    byDay.set(dayOfWeek, {
      dayOfWeek,
      isWorkday,
      scheduleMode,
      startTime,
      endTime,
      breaks,
      fixedSlotTimes,
    });
  }

  if (byDay.size !== 7) {
    throw new AppError("Week schedule must contain 7 days", 400, "VALIDATION_ERROR");
  }

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const day = byDay.get(dayOfWeek);
    if (!day) {
      throw new AppError("Week schedule must contain 7 days", 400, "VALIDATION_ERROR");
    }
    return day;
  });
}

export function normalizeExceptionInput(value: unknown): EditorExceptionInput {
  if (!value || typeof value !== "object") {
    throw new AppError("Invalid body", 400, "INVALID_BODY");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.date !== "string") {
    throw new AppError("Invalid date", 400, "DATE_INVALID");
  }

  const scheduleMode = parseScheduleMode(record.scheduleMode);
  const isWorkday = Boolean(record.isWorkday);
  const fixedSlotTimes = normalizeFixedSlotTimes(record.fixedSlotTimes);
  const startTime = normalizeTime(record.startTime);
  const endTime = normalizeTime(record.endTime);

  if (isWorkday && scheduleMode === "FLEXIBLE") {
    if (!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new AppError("Invalid time range", 400, "TIME_RANGE_INVALID");
    }
  }

  const normalizedStart = scheduleMode === "FIXED" ? FIXED_RANGE_START : startTime;
  const normalizedEnd = scheduleMode === "FIXED" ? FIXED_RANGE_END : endTime;
  const noteRaw = typeof record.note === "string" ? record.note.trim() : "";
  const note = noteRaw.length > 0 ? noteRaw.slice(0, 120) : null;

  return {
    date: record.date,
    isWorkday,
    scheduleMode,
    startTime: normalizedStart,
    endTime: normalizedEnd,
    breaks:
      isWorkday && scheduleMode === "FLEXIBLE" && normalizedStart && normalizedEnd
        ? normalizeBreaks(record.breaks, normalizedStart, normalizedEnd)
        : [],
    fixedSlotTimes,
    note,
  };
}

function normalizeExceptionList(values: unknown): EditorExceptionInput[] {
  if (!Array.isArray(values)) return [];
  const byDate = new Map<string, EditorExceptionInput>();
  for (const item of values) {
    const normalized = normalizeExceptionInput(item);
    byDate.set(normalized.date, normalized);
  }
  return Array.from(byDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date)
  );
}

export function normalizeScheduleState(input: {
  weekSchedule: unknown;
  exceptions: unknown;
}): NormalizedScheduleState {
  return {
    weekSchedule: normalizeWeekScheduleInput(input.weekSchedule),
    exceptions: normalizeExceptionList(input.exceptions),
  };
}

export function serializeScheduleState(state: NormalizedScheduleState): string {
  const weekSchedule = state.weekSchedule.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    isWorkday: day.isWorkday,
    scheduleMode: day.scheduleMode,
    startTime: day.startTime,
    endTime: day.endTime,
    breaks: day.breaks
      .map((entry) => ({ start: entry.start, end: entry.end, title: entry.title ?? null }))
      .sort((left, right) => left.start.localeCompare(right.start)),
    fixedSlotTimes: normalizeFixedSlotTimes(day.fixedSlotTimes),
  }));

  const exceptions = state.exceptions
    .map((item) => ({
      date: item.date,
      isWorkday: item.isWorkday,
      scheduleMode: item.scheduleMode,
      startTime: item.startTime,
      endTime: item.endTime,
      note: item.note,
      breaks: item.breaks
        .map((entry) => ({ start: entry.start, end: entry.end, title: entry.title ?? null }))
        .sort((left, right) => left.start.localeCompare(right.start)),
      fixedSlotTimes: normalizeFixedSlotTimes(item.fixedSlotTimes),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return JSON.stringify({ weekSchedule, exceptions });
}

export function toScheduleEditorRequestPayload(
  state: NormalizedScheduleState
): ScheduleEditorRequestPayload {
  return {
    format: "EDITOR_V1",
    weekSchedule: state.weekSchedule,
    exceptions: state.exceptions,
  };
}

export function isScheduleEditorRequestPayload(value: unknown): value is ScheduleEditorRequestPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === "EDITOR_V1" &&
    Array.isArray(record.weekSchedule) &&
    Array.isArray(record.exceptions)
  );
}

export function normalizeScheduleEditorRequestPayload(value: unknown): NormalizedScheduleState {
  if (!isScheduleEditorRequestPayload(value)) {
    throw new AppError("Invalid schedule payload", 400, "INVALID_BODY");
  }
  return normalizeScheduleState({
    weekSchedule: value.weekSchedule,
    exceptions: value.exceptions,
  });
}

/**
 * Pure mapping helper used by both the snapshot rebuilder and the
 * weekly-template signature builder. Lives here so client signature
 * computations (if ever needed) don't pull the server file.
 */
export function mapTemplateForDay(record: {
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string;
  endTime: string;
  breaks: BreakDto[];
}) {
  const startLocal =
    record.scheduleMode === "FIXED" ? FIXED_RANGE_START : record.startTime;
  const endLocal = record.scheduleMode === "FIXED" ? FIXED_RANGE_END : record.endTime;
  const breaks = record.scheduleMode === "FIXED" ? [] : record.breaks;
  return { startLocal, endLocal, breaks };
}

export function signatureHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}
