import { ScheduleMode } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { parseDateKeyParts } from "@/lib/schedule/dateKey";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export const runtime = "nodejs";

type BreakDto = {
  start: string;
  end: string;
};

type DayScheduleDto = {
  dayOfWeek: number; // 0=Mon ... 6=Sun
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string;
  endTime: string;
  breaks: BreakDto[];
  fixedSlotTimes: string[];
};

type ScheduleExceptionDto = {
  id: string;
  date: string; // YYYY-MM-DD
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string | null;
  endTime: string | null;
  breaks: BreakDto[];
  fixedSlotTimes: string[];
};

type WeekTemplateDto = {
  id: "standard" | "2x2";
  label: string;
};

type PatchBody = {
  weekSchedule?: unknown;
  exception?: unknown;
  deleteException?: unknown;
};

type ExceptionInput = {
  date: string;
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string | null;
  endTime: string | null;
  breaks: BreakDto[];
  fixedSlotTimes: string[];
};

const DAY_TEMPLATE_PREFIX = "__cabinet_master_day_";
const DEFAULT_FLEX_START = "09:00";
const DEFAULT_FLEX_END = "20:00";
const FIXED_RANGE_START = "00:00";
const FIXED_RANGE_END = "23:55";
const WEEK_TEMPLATE_OPTIONS: WeekTemplateDto[] = [
  { id: "standard", label: "\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043d\u0430\u044f \u043f\u044f\u0442\u0438\u0434\u043d\u0435\u0432\u043a\u0430" },
  { id: "2x2", label: "2 \u0447\u0435\u0440\u0435\u0437 2" },
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
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return hour * 60 + minute;
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

function buildDefaultWeekSchedule(): DayScheduleDto[] {
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

function normalizeWeekSchedule(value: unknown): DayScheduleDto[] {
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

function normalizeExceptionInput(value: unknown): ExceptionInput {
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

async function buildScheduleResponse(providerId: string) {
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

async function saveWeekSchedule(providerId: string, weekSchedule: DayScheduleDto[]): Promise<void> {
  const config = await prisma.weeklyScheduleConfig.upsert({
    where: { providerId },
    update: {},
    create: { providerId },
    select: { id: true },
  });

  const rows: Array<{
    configId: string;
    weekday: number;
    templateId: string | null;
    isActive: boolean;
    scheduleMode: ScheduleMode;
    fixedSlotTimes: string[];
  }> = [];

  for (const day of weekSchedule) {
    const templateName = `${DAY_TEMPLATE_PREFIX}${day.dayOfWeek + 1}`;
    const templateStart = day.scheduleMode === "FIXED" ? FIXED_RANGE_START : day.startTime;
    const templateEnd = day.scheduleMode === "FIXED" ? FIXED_RANGE_END : day.endTime;
    const templateBreaks = day.scheduleMode === "FIXED" ? [] : day.breaks;

    const template = await prisma.scheduleTemplate.upsert({
      where: { providerId_name: { providerId, name: templateName } },
      update: { startLocal: templateStart, endLocal: templateEnd, color: null },
      create: {
        providerId,
        name: templateName,
        startLocal: templateStart,
        endLocal: templateEnd,
        color: null,
      },
      select: { id: true },
    });

    await prisma.scheduleTemplateBreak.deleteMany({ where: { templateId: template.id } });
    if (templateBreaks.length > 0) {
      await prisma.scheduleTemplateBreak.createMany({
        data: templateBreaks.map((item, index) => ({
          templateId: template.id,
          startLocal: item.start,
          endLocal: item.end,
          sortOrder: index,
        })),
      });
    }

    rows.push({
      configId: config.id,
      weekday: day.dayOfWeek + 1,
      templateId: template.id,
      isActive: day.isWorkday,
      scheduleMode: day.scheduleMode,
      fixedSlotTimes: day.fixedSlotTimes,
    });
  }

  await prisma.weeklyScheduleDay.deleteMany({ where: { configId: config.id } });
  if (rows.length > 0) {
    await prisma.weeklyScheduleDay.createMany({ data: rows });
  }
  await prisma.weeklyScheduleConfig.update({ where: { id: config.id }, data: {} });
}

async function saveException(providerId: string, input: ExceptionInput): Promise<void> {
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

async function removeException(providerId: string, exceptionId: string): Promise<void> {
  const existing = await prisma.scheduleOverride.findFirst({
    where: { id: exceptionId, providerId },
    select: { id: true, date: true },
  });
  if (!existing) return;

  await prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date: existing.date } });
  await prisma.scheduleOverride.delete({ where: { id: existing.id } });
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const providerId = await getCurrentMasterProviderId(user.id);
    const data = await buildScheduleResponse(providerId);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cabinet/master/schedule failed", {
        requestId: getRequestId(req),
        route: "GET /api/cabinet/master/schedule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const providerId = await getCurrentMasterProviderId(user.id);

    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body || typeof body !== "object") {
      throw new AppError("Invalid body", 400, "INVALID_BODY");
    }

    let changed = false;
    if (body.weekSchedule !== undefined) {
      const weekSchedule = normalizeWeekSchedule(body.weekSchedule);
      await saveWeekSchedule(providerId, weekSchedule);
      changed = true;
    }

    if (body.exception !== undefined) {
      const exception = normalizeExceptionInput(body.exception);
      await saveException(providerId, exception);
      changed = true;
    }

    if (typeof body.deleteException === "string" && body.deleteException.trim()) {
      await removeException(providerId, body.deleteException.trim());
      changed = true;
    }

    if (changed) {
      await invalidateSlotsForMaster(providerId);
    }

    const data = await buildScheduleResponse(providerId);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/cabinet/master/schedule failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/cabinet/master/schedule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
