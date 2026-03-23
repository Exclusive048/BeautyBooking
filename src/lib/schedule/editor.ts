import { ScheduleMode } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { parseDateKeyParts } from "@/lib/schedule/dateKey";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export type BreakDto = {
  start: string;
  end: string;
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
};

export type WeekTemplateDto = {
  id: "standard" | "2x2";
  label: string;
};

export type ScheduleEditorSnapshot = {
  timezone: string;
  weekSchedule: DayScheduleDto[];
  exceptions: ScheduleExceptionDto[];
  templates: WeekTemplateDto[];
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
};

const AUTO_TEMPLATE_PREFIX = "__editor_auto_";
const DEFAULT_FLEX_START = "09:00";
const DEFAULT_FLEX_END = "20:00";
export const FIXED_RANGE_START = "00:00";
export const FIXED_RANGE_END = "23:55";

export const WEEK_TEMPLATE_OPTIONS: WeekTemplateDto[] = [
  { id: "standard", label: "Стандартная пятидневка" },
  { id: "2x2", label: "2 через 2" },
];

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

function normalizeFixedSlotTimes(values: unknown): string[] {
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
      return { start, end, startMinutes, endMinutes };
    })
    .filter((value): value is { start: string; end: string; startMinutes: number; endMinutes: number } =>
      Boolean(value)
    )
    .sort((left, right) => left.startMinutes - right.startMinutes);

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].startMinutes < rows[index - 1].endMinutes) {
      throw new AppError("Breaks overlap", 400, "BREAK_OVERLAP");
    }
  }
  return rows.map((row) => ({ start: row.start, end: row.end }));
}

function parseDateKeyToUtcStart(dateKey: string): Date {
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
    if (typeof dayOfWeekRaw !== "number" || !Number.isInteger(dayOfWeekRaw) || dayOfWeekRaw < 0 || dayOfWeekRaw > 6) {
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
  };
}

function normalizeExceptionList(values: unknown): EditorExceptionInput[] {
  if (!Array.isArray(values)) return [];
  const byDate = new Map<string, EditorExceptionInput>();
  for (const item of values) {
    const normalized = normalizeExceptionInput(item);
    byDate.set(normalized.date, normalized);
  }
  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
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
      .map((entry) => ({ start: entry.start, end: entry.end }))
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
      breaks: item.breaks
        .map((entry) => ({ start: entry.start, end: entry.end }))
        .sort((left, right) => left.start.localeCompare(right.start)),
      fixedSlotTimes: normalizeFixedSlotTimes(item.fixedSlotTimes),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return JSON.stringify({ weekSchedule, exceptions });
}

export function toScheduleEditorRequestPayload(state: NormalizedScheduleState): ScheduleEditorRequestPayload {
  return {
    format: "EDITOR_V1",
    weekSchedule: state.weekSchedule,
    exceptions: state.exceptions,
  };
}

export function isScheduleEditorRequestPayload(value: unknown): value is ScheduleEditorRequestPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.format === "EDITOR_V1" && Array.isArray(record.weekSchedule) && Array.isArray(record.exceptions);
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

function mapTemplateForDay(record: {
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string;
  endTime: string;
  breaks: BreakDto[];
}) {
  const startLocal = record.scheduleMode === "FIXED" ? FIXED_RANGE_START : record.startTime;
  const endLocal = record.scheduleMode === "FIXED" ? FIXED_RANGE_END : record.endTime;
  const breaks = record.scheduleMode === "FIXED" ? [] : record.breaks;
  return { startLocal, endLocal, breaks };
}

function signatureHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

async function saveWeekSchedule(providerId: string, weekSchedule: DayScheduleDto[]): Promise<void> {
  const config = await prisma.weeklyScheduleConfig.upsert({
    where: { providerId },
    update: {},
    create: { providerId },
    select: { id: true },
  });

  const signatures = new Map<string, { name: string; startLocal: string; endLocal: string; breaks: BreakDto[] }>();
  const signatureOrder: string[] = [];
  for (const day of weekSchedule) {
    if (!day.isWorkday) continue;
    const mapped = mapTemplateForDay(day);
    const signature = `${mapped.startLocal}|${mapped.endLocal}|${JSON.stringify(mapped.breaks)}`;
    if (signatures.has(signature)) continue;
    signatures.set(signature, {
      name: `${AUTO_TEMPLATE_PREFIX}${signatureHash(signature)}`,
      startLocal: mapped.startLocal,
      endLocal: mapped.endLocal,
      breaks: mapped.breaks,
    });
    signatureOrder.push(signature);
  }

  const templateIdBySignature = new Map<string, string>();
  for (const signature of signatureOrder) {
    const item = signatures.get(signature);
    if (!item) continue;
    const template = await prisma.scheduleTemplate.upsert({
      where: { providerId_name: { providerId, name: item.name } },
      update: { startLocal: item.startLocal, endLocal: item.endLocal, color: null },
      create: {
        providerId,
        name: item.name,
        startLocal: item.startLocal,
        endLocal: item.endLocal,
        color: null,
      },
      select: { id: true },
    });
    templateIdBySignature.set(signature, template.id);
    await prisma.scheduleTemplateBreak.deleteMany({ where: { templateId: template.id } });
    if (item.breaks.length > 0) {
      await prisma.scheduleTemplateBreak.createMany({
        data: item.breaks.map((entry, index) => ({
          templateId: template.id,
          startLocal: entry.start,
          endLocal: entry.end,
          sortOrder: index,
        })),
      });
    }
  }

  const rows: Array<{
    configId: string;
    weekday: number;
    templateId: string | null;
    isActive: boolean;
    scheduleMode: ScheduleMode;
    fixedSlotTimes: string[];
  }> = weekSchedule.map((day) => {
    if (!day.isWorkday) {
      return {
        configId: config.id,
        weekday: day.dayOfWeek + 1,
        templateId: null,
        isActive: false,
        scheduleMode: day.scheduleMode,
        fixedSlotTimes: day.fixedSlotTimes,
      };
    }
    const mapped = mapTemplateForDay(day);
    const signature = `${mapped.startLocal}|${mapped.endLocal}|${JSON.stringify(mapped.breaks)}`;
    const templateId = templateIdBySignature.get(signature) ?? null;
    return {
      configId: config.id,
      weekday: day.dayOfWeek + 1,
      templateId,
      isActive: Boolean(templateId),
      scheduleMode: day.scheduleMode,
      fixedSlotTimes: day.fixedSlotTimes,
    };
  });

  await prisma.weeklyScheduleDay.deleteMany({ where: { configId: config.id } });
  if (rows.length > 0) {
    await prisma.weeklyScheduleDay.createMany({ data: rows });
  }
  await prisma.weeklyScheduleConfig.update({ where: { id: config.id }, data: {} });

  const usedAutoTemplateIds = new Set(Array.from(templateIdBySignature.values()));
  await prisma.scheduleTemplate.deleteMany({
    where: {
      providerId,
      name: { startsWith: AUTO_TEMPLATE_PREFIX },
      id: { notIn: Array.from(usedAutoTemplateIds) },
    },
  });
}

async function saveException(providerId: string, input: EditorExceptionInput): Promise<void> {
  const date = parseDateKeyToUtcStart(input.date);
  const existing = await prisma.scheduleOverride.findFirst({
    where: { providerId, date },
    select: { id: true },
  });

  const kind = input.isWorkday ? "TIME_RANGE" : "OFF";
  const isDayOff = !input.isWorkday;

  if (existing) {
    await prisma.scheduleOverride.update({
      where: { id: existing.id },
      data: {
        kind,
        isDayOff,
        isWorkday: input.isWorkday,
        startLocal: input.isWorkday ? input.startTime : null,
        endLocal: input.isWorkday ? input.endTime : null,
        templateId: null,
        isActive: null,
        scheduleMode: input.scheduleMode,
        fixedSlotTimes: input.scheduleMode === "FIXED" ? input.fixedSlotTimes : [],
      },
    });
  } else {
    await prisma.scheduleOverride.create({
      data: {
        providerId,
        date,
        kind,
        isDayOff,
        isWorkday: input.isWorkday,
        startLocal: input.isWorkday ? input.startTime : null,
        endLocal: input.isWorkday ? input.endTime : null,
        scheduleMode: input.scheduleMode,
        fixedSlotTimes: input.scheduleMode === "FIXED" ? input.fixedSlotTimes : [],
      },
    });
  }

  await prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } });
  if (input.isWorkday && input.scheduleMode === "FLEXIBLE" && input.breaks.length > 0) {
    await prisma.scheduleBreak.createMany({
      data: input.breaks.map((item) => ({
        providerId,
        kind: "OVERRIDE",
        date,
        startLocal: item.start,
        endLocal: item.end,
      })),
    });
  }
}

async function removeExceptionByDate(providerId: string, dateKey: string): Promise<void> {
  const date = parseDateKeyToUtcStart(dateKey);
  await prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } });
  await prisma.scheduleOverride.deleteMany({ where: { providerId, date } });
}

export async function buildScheduleSnapshot(providerId: string): Promise<ScheduleEditorSnapshot> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true },
  });
  if (!provider) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const [config, overrides, overrideBreaks] = await Promise.all([
    prisma.weeklyScheduleConfig.findUnique({
      where: { providerId },
      select: {
        days: {
          orderBy: { weekday: "asc" },
          select: {
            weekday: true,
            isActive: true,
            scheduleMode: true,
            fixedSlotTimes: true,
            template: {
              select: {
                startLocal: true,
                endLocal: true,
                breaks: { select: { startLocal: true, endLocal: true, sortOrder: true } },
              },
            },
          },
        },
      },
    }),
    prisma.scheduleOverride.findMany({
      where: { providerId },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        kind: true,
        isDayOff: true,
        isWorkday: true,
        startLocal: true,
        endLocal: true,
        scheduleMode: true,
        fixedSlotTimes: true,
        template: {
          select: {
            startLocal: true,
            endLocal: true,
            breaks: { select: { startLocal: true, endLocal: true, sortOrder: true } },
          },
        },
      },
    }),
    prisma.scheduleBreak.findMany({
      where: { providerId, kind: "OVERRIDE", date: { not: null } },
      select: { date: true, startLocal: true, endLocal: true },
      orderBy: [{ date: "asc" }, { startLocal: "asc" }],
    }),
  ]);

  const weekSchedule = buildDefaultWeekSchedule();
  for (const day of config?.days ?? []) {
    const index = day.weekday - 1;
    if (index < 0 || index > 6) continue;
    const templateBreaks =
      day.template?.breaks
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({ start: item.startLocal, end: item.endLocal })) ?? [];
    weekSchedule[index] = {
      dayOfWeek: index,
      isWorkday: Boolean(day.isActive && day.template),
      scheduleMode: day.scheduleMode,
      startTime: day.template?.startLocal ?? weekSchedule[index].startTime,
      endTime: day.template?.endLocal ?? weekSchedule[index].endTime,
      breaks: templateBreaks,
      fixedSlotTimes: normalizeFixedSlotTimes(day.fixedSlotTimes),
    };
  }

  const overrideBreaksByDate = new Map<string, BreakDto[]>();
  for (const row of overrideBreaks) {
    if (!row.date) continue;
    const key = toLocalDateKey(row.date, provider.timezone);
    const list = overrideBreaksByDate.get(key) ?? [];
    list.push({ start: row.startLocal, end: row.endLocal });
    overrideBreaksByDate.set(key, list);
  }

  const exceptions: ScheduleExceptionDto[] = overrides.map((row) => {
    const dateKey = toLocalDateKey(row.date, provider.timezone);
    const isWorkday = row.isWorkday ?? !row.isDayOff;
    const scheduleMode =
      row.scheduleMode ?? (normalizeFixedSlotTimes(row.fixedSlotTimes).length > 0 ? "FIXED" : "FLEXIBLE");
    const templateBreaks =
      row.template?.breaks
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({ start: item.startLocal, end: item.endLocal })) ?? [];
    const breaks = row.kind === "TEMPLATE" ? templateBreaks : overrideBreaksByDate.get(dateKey) ?? [];

    return {
      id: row.id,
      date: dateKey,
      isWorkday,
      scheduleMode,
      startTime: row.kind === "TEMPLATE" ? row.template?.startLocal ?? null : row.startLocal,
      endTime: row.kind === "TEMPLATE" ? row.template?.endLocal ?? null : row.endLocal,
      breaks: isWorkday && scheduleMode === "FLEXIBLE" ? breaks : [],
      fixedSlotTimes: normalizeFixedSlotTimes(row.fixedSlotTimes),
    };
  });

  return {
    timezone: provider.timezone,
    weekSchedule,
    exceptions,
    templates: WEEK_TEMPLATE_OPTIONS,
  };
}

export async function applyScheduleSnapshot(
  providerId: string,
  input: {
    weekSchedule: DayScheduleDto[];
    exceptions: Array<Omit<ScheduleExceptionDto, "id">>;
  }
): Promise<void> {
  const weekSchedule = normalizeWeekScheduleInput(input.weekSchedule as unknown);
  const normalizedExceptions = input.exceptions
    .map((item) => normalizeExceptionInput(item))
    .sort((left, right) => left.date.localeCompare(right.date));

  await saveWeekSchedule(providerId, weekSchedule);

  const existing = await prisma.scheduleOverride.findMany({
    where: { providerId },
    select: { date: true },
  });
  const existingDateKeys = new Set(existing.map((item) => item.date.toISOString().slice(0, 10)));
  const nextDateKeys = new Set<string>();

  for (const item of normalizedExceptions) {
    await saveException(providerId, item);
    nextDateKeys.add(item.date);
  }

  for (const key of existingDateKeys) {
    if (!nextDateKeys.has(key)) {
      await removeExceptionByDate(providerId, key);
    }
  }

  await invalidateSlotsForMaster(providerId);
}
