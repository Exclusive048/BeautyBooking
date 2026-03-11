import { ScheduleOverrideKind } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { timeToMinutes } from "@/lib/schedule/time";
import { parseDateKeyParts } from "@/lib/schedule/dateKey";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";

export type ScheduleBreakInput = {
  startLocal: string;
  endLocal: string;
};

export type ScheduleTemplateInput = {
  name: string;
  startLocal: string;
  endLocal: string;
  breaks: ScheduleBreakInput[];
  color?: string | null;
};

export type ScheduleTemplateDto = {
  id: string;
  name: string;
  startLocal: string;
  endLocal: string;
  breaks: ScheduleBreakInput[];
  color: string | null;
};

export type WeeklyScheduleDayInput = {
  weekday: number;
  templateId: string | null;
  isActive: boolean;
};

export type WeeklyScheduleConfigDto = {
  days: WeeklyScheduleDayInput[];
};

export type ScheduleOverrideInput =
  | { type: "OFF" }
  | { type: "TIME_RANGE"; startLocal: string; endLocal: string; breaks: ScheduleBreakInput[] }
  | { type: "TEMPLATE"; templateId: string; isActive: boolean };

export type ScheduleOverrideDto = {
  date: string;
  type: "OFF" | "TIME_RANGE" | "TEMPLATE";
  startLocal: string | null;
  endLocal: string | null;
  templateId: string | null;
  isActive: boolean | null;
  breaks: ScheduleBreakInput[];
};

export type ScheduleTemplatePayload = {
  clientId: string;
  id?: string;
  name: string;
  startLocal: string;
  endLocal: string;
  breaks?: ScheduleBreakInput[];
  color?: string | null;
};

export type WeeklySchedulePayload = {
  days: WeeklyScheduleDayInput[];
};

export type ScheduleOverridePayload = {
  date: string;
  type: "OFF" | "TIME_RANGE" | "TEMPLATE";
  startLocal?: string | null;
  endLocal?: string | null;
  breaks?: ScheduleBreakInput[];
  templateId?: string | null;
  isActive?: boolean | null;
};

export type SchedulePayload = {
  templates: ScheduleTemplatePayload[];
  weekly: WeeklySchedulePayload;
  overrides: ScheduleOverridePayload[];
  scheduleMode?: "FLEXIBLE" | "FIXED";
  fixedSlotTimes?: string[];
  removedOverrides?: string[];
};

const MAX_TEMPLATES = 7;
const MAX_BREAKS = 3;

function parseDateKey(value: string): Date {
  const parts = parseDateKeyParts(value);
  if (!parts) {
    throw new AppError("Некорректная дата.", 400, "DATE_INVALID");
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

function parseMonthKey(value: string): { from: Date; toExclusive: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new AppError("Некорректный месяц.", 400, "DATE_INVALID");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  if (Number.isNaN(from.getTime())) throw new AppError("Некорректный месяц.", 400, "DATE_INVALID");
  const toExclusive = new Date(from);
  toExclusive.setUTCMonth(toExclusive.getUTCMonth() + 1);
  return { from, toExclusive };
}

function ensureTime(value: string, label: string): number {
  const minutes = timeToMinutes(value);
  if (minutes === null) {
    throw new AppError(`Некорректный формат времени (${label}).`, 400, "TIME_RANGE_INVALID");
  }
  return minutes;
}

function validateTimeRange(startLocal: string, endLocal: string): { start: number; end: number } {
  const start = ensureTime(startLocal, "начало");
  const end = ensureTime(endLocal, "конец");
  if (start >= end) {
    throw new AppError("Начало должно быть раньше конца.", 400, "TIME_RANGE_INVALID");
  }
  return { start, end };
}

function normalizeBreaks(
  breaks: ScheduleBreakInput[] | undefined,
  range: { start: number; end: number }
): ScheduleBreakInput[] {
  if (!breaks || breaks.length === 0) return [];
  if (breaks.length > MAX_BREAKS) {
    throw new AppError("Слишком много перерывов.", 400, "BREAKS_LIMIT");
  }

  const normalized = breaks.map((item) => {
    const start = ensureTime(item.startLocal, "перерыв");
    const end = ensureTime(item.endLocal, "перерыв");
    if (start >= end) {
      throw new AppError("Некорректный интервал перерыва.", 400, "BREAK_INVALID");
    }
    if (start <= range.start || end >= range.end) {
      throw new AppError("Перерыв выходит за пределы смены.", 400, "BREAK_RANGE");
    }
    return { ...item, start, end };
  });

  const sorted = normalized.slice().sort((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start < sorted[index - 1].end) {
      throw new AppError("Перерывы пересекаются.", 400, "BREAK_OVERLAP");
    }
  }

  return normalized.map((item) => ({ startLocal: item.startLocal, endLocal: item.endLocal }));
}

function normalizeWeeklyDays(days: WeeklyScheduleDayInput[]): WeeklyScheduleDayInput[] {
  const map = new Map<number, WeeklyScheduleDayInput>();
  for (const day of days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7) {
      throw new AppError("Некорректный день недели.", 400, "DAY_INVALID");
    }
    if (map.has(day.weekday)) {
      throw new AppError("Дублирование дня недели.", 400, "VALIDATION_ERROR");
    }
    if (!day.templateId && day.isActive) {
      throw new AppError("Нельзя включить день без шаблона.", 400, "VALIDATION_ERROR");
    }
    map.set(day.weekday, {
      weekday: day.weekday,
      templateId: day.templateId ?? null,
      isActive: day.templateId ? day.isActive : false,
    });
  }

  return Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    return map.get(weekday) ?? { weekday, templateId: null, isActive: false };
  });
}

async function ensureTemplateOwnership(providerId: string, templateId: string): Promise<void> {
  const exists = await prisma.scheduleTemplate.findFirst({
    where: { id: templateId, providerId },
    select: { id: true },
  });
  if (!exists) {
    throw new AppError("Шаблон не найден.", 404, "NOT_FOUND");
  }
}

async function ensureTemplatesExist(providerId: string, templateIds: string[]): Promise<void> {
  if (templateIds.length === 0) return;
  const rows = await prisma.scheduleTemplate.findMany({
    where: { id: { in: templateIds }, providerId },
    select: { id: true },
  });
  if (rows.length !== new Set(templateIds).size) {
    throw new AppError("Шаблон не найден.", 404, "NOT_FOUND");
  }
}

export async function listScheduleTemplates(providerId: string): Promise<ScheduleTemplateDto[]> {
  const templates = await prisma.scheduleTemplate.findMany({
    where: { providerId },
    select: {
      id: true,
      name: true,
      startLocal: true,
      endLocal: true,
      color: true,
      breaks: { select: { startLocal: true, endLocal: true, sortOrder: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    startLocal: template.startLocal,
    endLocal: template.endLocal,
    color: template.color ?? null,
    breaks: template.breaks
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ startLocal: item.startLocal, endLocal: item.endLocal })),
  }));
}

export async function createScheduleTemplate(
  providerId: string,
  input: ScheduleTemplateInput
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new AppError("Название шаблона обязательно.", 400, "NAME_REQUIRED");

  const count = await prisma.scheduleTemplate.count({ where: { providerId } });
  if (count >= MAX_TEMPLATES) {
    throw new AppError("Достигнут лимит шаблонов.", 400, "VALIDATION_ERROR");
  }

  const range = validateTimeRange(input.startLocal, input.endLocal);
  const breaks = normalizeBreaks(input.breaks, range);

  const existing = await prisma.scheduleTemplate.findFirst({
    where: { providerId, name },
    select: { id: true },
  });
  if (existing) throw new AppError("Шаблон с таким названием уже существует.", 409, "ALREADY_EXISTS");

  const created = await prisma.scheduleTemplate.create({
    data: {
      providerId,
      name,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      color: input.color ?? null,
      breaks: breaks.length
        ? {
            create: breaks.map((item, index) => ({
              startLocal: item.startLocal,
              endLocal: item.endLocal,
              sortOrder: index,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  await invalidateSlotsForMaster(providerId);
  return { id: created.id };
}

export async function updateScheduleTemplate(
  providerId: string,
  templateId: string,
  input: ScheduleTemplateInput
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new AppError("Название шаблона обязательно.", 400, "NAME_REQUIRED");

  await ensureTemplateOwnership(providerId, templateId);

  const range = validateTimeRange(input.startLocal, input.endLocal);
  const breaks = normalizeBreaks(input.breaks, range);

  const existing = await prisma.scheduleTemplate.findFirst({
    where: { providerId, name, id: { not: templateId } },
    select: { id: true },
  });
  if (existing) throw new AppError("Шаблон с таким названием уже существует.", 409, "ALREADY_EXISTS");

  await prisma.$transaction([
    prisma.scheduleTemplate.update({
      where: { id: templateId },
      data: {
        name,
        startLocal: input.startLocal,
        endLocal: input.endLocal,
        color: input.color ?? null,
      },
    }),
    prisma.scheduleTemplateBreak.deleteMany({ where: { templateId } }),
    ...(breaks.length
      ? [
          prisma.scheduleTemplateBreak.createMany({
            data: breaks.map((item, index) => ({
              templateId,
              startLocal: item.startLocal,
              endLocal: item.endLocal,
              sortOrder: index,
            })),
          }),
        ]
      : []),
  ]);

  await invalidateSlotsForMaster(providerId);
  return { id: templateId };
}

export async function deleteScheduleTemplate(providerId: string, templateId: string): Promise<{ id: string }> {
  await ensureTemplateOwnership(providerId, templateId);
  await prisma.scheduleTemplate.delete({ where: { id: templateId } });
  await invalidateSlotsForMaster(providerId);
  return { id: templateId };
}

export async function getWeeklyScheduleConfig(providerId: string): Promise<WeeklyScheduleConfigDto> {
  const config = await prisma.weeklyScheduleConfig.findUnique({
    where: { providerId },
    select: { days: { select: { weekday: true, templateId: true, isActive: true } } },
  });
  const days = config?.days ?? [];
  return { days: normalizeWeeklyDays(days) };
}

export async function updateWeeklyScheduleConfig(
  providerId: string,
  days: WeeklyScheduleDayInput[]
): Promise<WeeklyScheduleConfigDto> {
  const normalized = normalizeWeeklyDays(days);
  const templateIds = normalized
    .map((item) => item.templateId)
    .filter((id): id is string => Boolean(id));
  await ensureTemplatesExist(providerId, templateIds);

  const config = await prisma.weeklyScheduleConfig.findUnique({
    where: { providerId },
    select: { id: true },
  });

  if (!config) {
    await prisma.weeklyScheduleConfig.create({
      data: {
        providerId,
        days: {
          create: normalized.map((item) => ({
            weekday: item.weekday,
            templateId: item.templateId,
            isActive: item.isActive,
          })),
        },
      },
    });
  } else {
    await prisma.$transaction([
      prisma.weeklyScheduleDay.deleteMany({ where: { configId: config.id } }),
      prisma.weeklyScheduleDay.createMany({
        data: normalized.map((item) => ({
          configId: config.id,
          weekday: item.weekday,
          templateId: item.templateId,
          isActive: item.isActive,
        })),
      }),
      prisma.weeklyScheduleConfig.update({ where: { id: config.id }, data: {} }),
    ]);
  }

  await invalidateSlotsForMaster(providerId);
  return { days: normalized };
}

export async function listScheduleOverrides(providerId: string, month: string): Promise<ScheduleOverrideDto[]> {
  const range = parseMonthKey(month);
  const overrides = await prisma.scheduleOverride.findMany({
    where: { providerId, date: { gte: range.from, lt: range.toExclusive } },
    orderBy: { date: "asc" },
    select: {
      date: true,
      kind: true,
      startLocal: true,
      endLocal: true,
      templateId: true,
      isActive: true,
      isDayOff: true,
    },
  });

  const breaks = await prisma.scheduleBreak.findMany({
    where: { providerId, kind: "OVERRIDE", date: { gte: range.from, lt: range.toExclusive } },
    select: { date: true, startLocal: true, endLocal: true },
    orderBy: [{ date: "asc" }, { startLocal: "asc" }],
  });

  const breaksByDate = new Map<string, ScheduleBreakInput[]>();
  for (const item of breaks) {
    if (!item.date) continue;
    const key = item.date.toISOString().slice(0, 10);
    const list = breaksByDate.get(key) ?? [];
    list.push({ startLocal: item.startLocal, endLocal: item.endLocal });
    breaksByDate.set(key, list);
  }

  return overrides.map((item) => {
    const dateKey = item.date.toISOString().slice(0, 10);
    const kind = item.kind === "OFF" || item.isDayOff ? "OFF" : item.kind === "TEMPLATE" ? "TEMPLATE" : "TIME_RANGE";
    return {
      date: dateKey,
      type: kind,
      startLocal: kind === "TIME_RANGE" ? item.startLocal ?? null : null,
      endLocal: kind === "TIME_RANGE" ? item.endLocal ?? null : null,
      templateId: kind === "TEMPLATE" ? item.templateId ?? null : null,
      isActive: kind === "TEMPLATE" ? item.isActive ?? true : null,
      breaks: kind === "TIME_RANGE" ? breaksByDate.get(dateKey) ?? [] : [],
    };
  });
}

export async function upsertScheduleOverride(
  providerId: string,
  dateKey: string,
  input: ScheduleOverrideInput
): Promise<void> {
  const date = parseDateKey(dateKey);
  let kind: ScheduleOverrideKind = "TIME_RANGE";
  let isDayOff = false;
  let startLocal: string | null = null;
  let endLocal: string | null = null;
  let templateId: string | null = null;
  let isActive: boolean | null = null;
  let breaks: ScheduleBreakInput[] = [];

  if (input.type === "OFF") {
    kind = "OFF";
    isDayOff = true;
  } else if (input.type === "TIME_RANGE") {
    const range = validateTimeRange(input.startLocal, input.endLocal);
    breaks = normalizeBreaks(input.breaks, range);
    startLocal = input.startLocal;
    endLocal = input.endLocal;
  } else {
    await ensureTemplateOwnership(providerId, input.templateId);
    kind = "TEMPLATE";
    templateId = input.templateId;
    isActive = Boolean(input.isActive);
    isDayOff = !isActive;
  }

  const existing = await prisma.scheduleOverride.findFirst({
    where: { providerId, date },
    select: { id: true },
  });

  await prisma.$transaction([
    existing
      ? prisma.scheduleOverride.update({
          where: { id: existing.id },
          data: {
            kind,
            isDayOff,
            startLocal,
            endLocal,
            templateId,
            isActive,
          },
        })
      : prisma.scheduleOverride.create({
          data: {
            providerId,
            date,
            kind,
            isDayOff,
            startLocal,
            endLocal,
            templateId,
            isActive,
          },
        }),
    prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } }),
    ...(kind === "TIME_RANGE" && breaks.length
      ? [
          prisma.scheduleBreak.createMany({
            data: breaks.map((item) => ({
              providerId,
              kind: "OVERRIDE",
              date,
              startLocal: item.startLocal,
              endLocal: item.endLocal,
            })),
          }),
        ]
      : []),
  ]);

  await invalidateSlotsForMaster(providerId);
}

export async function deleteScheduleOverride(providerId: string, dateKey: string): Promise<void> {
  const date = parseDateKey(dateKey);
  await prisma.$transaction([
    prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date } }),
    prisma.scheduleOverride.deleteMany({ where: { providerId, date } }),
  ]);
  await invalidateSlotsForMaster(providerId);
}

function normalizeFixedSlotTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute % 5 !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFixedSlotTimes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = normalizeFixedSlotTime(value);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function validateSchedulePayload(input: SchedulePayload): SchedulePayload {
  if (!input || typeof input !== "object") {
    throw new AppError("Некорректное тело запроса.", 400, "INVALID_BODY");
  }
  if (!Array.isArray(input.templates) || !input.weekly || !Array.isArray(input.weekly.days)) {
    throw new AppError("Некорректное тело запроса.", 400, "INVALID_BODY");
  }
  if (!Array.isArray(input.overrides)) {
    throw new AppError("Некорректное тело запроса.", 400, "INVALID_BODY");
  }
  return input;
}

export async function applySchedulePayload(providerId: string, payload: SchedulePayload): Promise<void> {
  const validated = validateSchedulePayload(payload);

  const templatesPayload = validated.templates.map((item) => ({
    clientId: item.clientId,
    id: item.id,
    name: item.name.trim(),
    startLocal: item.startLocal,
    endLocal: item.endLocal,
    color: item.color ?? null,
    breaks: item.breaks ?? [],
  }));

  const uniqueNames = new Set<string>();
  for (const template of templatesPayload) {
    if (!template.clientId) {
      throw new AppError("Некорректный шаблон.", 400, "VALIDATION_ERROR");
    }
    if (!template.name) {
      throw new AppError("Название шаблона обязательно.", 400, "NAME_REQUIRED");
    }
    if (uniqueNames.has(template.name)) {
      throw new AppError("Название шаблона должно быть уникальным.", 400, "VALIDATION_ERROR");
    }
    uniqueNames.add(template.name);
  }

  if (templatesPayload.length > MAX_TEMPLATES) {
    throw new AppError("Достигнут лимит шаблонов.", 400, "VALIDATION_ERROR");
  }

  const normalizedWeekly = normalizeWeeklyDays(validated.weekly.days);
  const currentProvider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, scheduleMode: true, fixedSlotTimes: true },
  });
  if (!currentProvider) {
    throw new AppError("Мастер не найден.", 404, "NOT_FOUND");
  }
  const shouldUpdateScheduleSettings = validated.scheduleMode !== undefined || validated.fixedSlotTimes !== undefined;
  const nextScheduleMode =
    validated.scheduleMode === "FIXED"
      ? "FIXED"
      : validated.scheduleMode === "FLEXIBLE"
        ? "FLEXIBLE"
        : currentProvider.scheduleMode;
  const nextFixedSlotTimes =
    validated.fixedSlotTimes !== undefined
      ? normalizeFixedSlotTimes(validated.fixedSlotTimes)
      : currentProvider.fixedSlotTimes;

  await prisma.$transaction(async (tx) => {
    if (shouldUpdateScheduleSettings) {
      await tx.provider.update({
        where: { id: providerId },
        data: {
          scheduleMode: nextScheduleMode,
          fixedSlotTimes: nextFixedSlotTimes,
        },
      });
    }

    const existingTemplates = await tx.scheduleTemplate.findMany({
      where: { providerId },
      select: { id: true, name: true },
    });

    const existingIds = new Set(existingTemplates.map((item) => item.id));
    const templateIdByKey = new Map<string, string>();
    const keepIds = new Set<string>();

    for (const template of templatesPayload) {
      const range = validateTimeRange(template.startLocal, template.endLocal);
      const breaks = normalizeBreaks(template.breaks, range);

      if (template.id && existingIds.has(template.id)) {
        await tx.scheduleTemplate.update({
          where: { id: template.id },
          data: {
            name: template.name,
            startLocal: template.startLocal,
            endLocal: template.endLocal,
            color: template.color,
          },
        });
        await tx.scheduleTemplateBreak.deleteMany({ where: { templateId: template.id } });
        if (breaks.length > 0) {
          await tx.scheduleTemplateBreak.createMany({
            data: breaks.map((item, index) => ({
              templateId: template.id!,
              startLocal: item.startLocal,
              endLocal: item.endLocal,
              sortOrder: index,
            })),
          });
        }
        templateIdByKey.set(template.clientId, template.id);
        templateIdByKey.set(template.id, template.id);
        keepIds.add(template.id);
      } else {
        const created = await tx.scheduleTemplate.create({
          data: {
            providerId,
            name: template.name,
            startLocal: template.startLocal,
            endLocal: template.endLocal,
            color: template.color,
            breaks: breaks.length
              ? {
                  create: breaks.map((item, index) => ({
                    startLocal: item.startLocal,
                    endLocal: item.endLocal,
                    sortOrder: index,
                  })),
                }
              : undefined,
          },
          select: { id: true },
        });
        templateIdByKey.set(template.clientId, created.id);
        keepIds.add(created.id);
      }
    }

    await tx.scheduleTemplate.deleteMany({
      where: {
        providerId,
        id: { notIn: Array.from(keepIds) },
      },
    });

    const config = await tx.weeklyScheduleConfig.findUnique({
      where: { providerId },
      select: { id: true },
    });

    const weeklyRows = normalizedWeekly.map((item) => {
      const mappedTemplateId = item.templateId ? templateIdByKey.get(item.templateId) ?? null : null;
      if (!mappedTemplateId && item.isActive) {
        throw new AppError("Нельзя включить день без шаблона.", 400, "VALIDATION_ERROR");
      }
      return {
        weekday: item.weekday,
        templateId: mappedTemplateId,
        isActive: Boolean(mappedTemplateId && item.isActive),
      };
    });

    if (!config) {
      await tx.weeklyScheduleConfig.create({
        data: {
          providerId,
          days: { create: weeklyRows },
        },
      });
    } else {
      await tx.weeklyScheduleDay.deleteMany({ where: { configId: config.id } });
      await tx.weeklyScheduleDay.createMany({
        data: weeklyRows.map((item) => ({
          configId: config.id,
          weekday: item.weekday,
          templateId: item.templateId,
          isActive: item.isActive,
        })),
      });
      await tx.weeklyScheduleConfig.update({ where: { id: config.id }, data: {} });
    }

    for (const override of validated.overrides) {
      const overrideDate = parseDateKey(override.date);
      let kind: ScheduleOverrideKind = "TIME_RANGE";
      let isDayOff = false;
      let startLocal: string | null = null;
      let endLocal: string | null = null;
      let templateId: string | null = null;
      let isActive: boolean | null = null;
      let breaks: ScheduleBreakInput[] = [];

      if (override.type === "OFF") {
        kind = "OFF";
        isDayOff = true;
      } else if (override.type === "TIME_RANGE") {
        const start = override.startLocal ?? "";
        const end = override.endLocal ?? "";
        const range = validateTimeRange(start, end);
        breaks = normalizeBreaks(override.breaks ?? [], range);
        startLocal = start;
        endLocal = end;
      } else {
        const key = override.templateId ?? "";
        templateId = templateIdByKey.get(key) ?? null;
        if (!templateId) {
          throw new AppError("Шаблон не найден.", 404, "NOT_FOUND");
        }
        kind = "TEMPLATE";
        isActive = Boolean(override.isActive);
        isDayOff = !isActive;
      }

      const existing = await tx.scheduleOverride.findFirst({
        where: { providerId, date: overrideDate },
        select: { id: true },
      });

      if (existing) {
        await tx.scheduleOverride.update({
          where: { id: existing.id },
          data: { kind, isDayOff, startLocal, endLocal, templateId, isActive },
        });
      } else {
        await tx.scheduleOverride.create({
          data: { providerId, date: overrideDate, kind, isDayOff, startLocal, endLocal, templateId, isActive },
        });
      }

      await tx.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date: overrideDate } });
      if (kind === "TIME_RANGE" && breaks.length > 0) {
        await tx.scheduleBreak.createMany({
          data: breaks.map((item) => ({
            providerId,
            kind: "OVERRIDE",
            date: overrideDate,
            startLocal: item.startLocal,
            endLocal: item.endLocal,
          })),
        });
      }
    }

    if (validated.removedOverrides && validated.removedOverrides.length > 0) {
      for (const dateKey of validated.removedOverrides) {
        const overrideDate = parseDateKey(dateKey);
        await tx.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date: overrideDate } });
        await tx.scheduleOverride.deleteMany({ where: { providerId, date: overrideDate } });
      }
    }
  });

  await invalidateSlotsForMaster(providerId);
}
