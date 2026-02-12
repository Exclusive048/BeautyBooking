import type { Prisma, ScheduleBreakKind, ScheduleOverrideKind, ScheduleRuleKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { buildScheduleRuleConfig } from "@/lib/schedule/rule-adapters";
import { resolvePublishedUntilLocal } from "@/lib/schedule/publish-horizon";
import { parseDateKeyParts } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { DayOfWeek, ScheduleBreakInterval } from "@/lib/domain/schedule";

type ScheduleVersion = {
  value: string;
  updatedAt: Date | null;
};

type ActiveRuleRecord = {
  kind: ScheduleRuleKind;
  timezone: string;
  anchorDate: Date | null;
  payloadJson: Prisma.JsonValue;
  isActive: boolean;
  updatedAt: Date;
};

type WeeklyRow = {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
};

export type OverrideRow = {
  date: Date;
  kind: ScheduleOverrideKind;
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  templateId: string | null;
  isActive: boolean | null;
  note: string | null;
  reason: string | null;
};

export type BreakRow = {
  kind: ScheduleBreakKind;
  dayOfWeek: number | null;
  date: Date | null;
  startLocal: string;
  endLocal: string;
};

export type BlockRow = {
  date: Date;
  startLocal: string;
  endLocal: string;
};

export type ScheduleWindow = {
  scheduleVersion: string;
  publishedUntilLocal: string;
  scheduleUpdatedAt: Date | null;
};

export type ScheduleContext = {
  providerId: string;
  timezone: string;
  scheduleWindow: ScheduleWindow;
  rule: ReturnType<typeof buildScheduleRuleConfig>;
  overridesByDateKey: Map<string, OverrideRow[]>;
  blocksByDateKey: Map<string, BlockRow[]>;
  breaksWeekly: BreakRow[];
  breaksOverrideByDateKey: Map<string, BreakRow[]>;
  templatesById: Map<string, { startLocal: string; endLocal: string; breaks: ScheduleBreakInterval[] }>;
};

function maxDate(dates: Array<Date | null | undefined>): Date | null {
  let max: Date | null = null;
  for (const value of dates) {
    if (!value) continue;
    if (!max || value.getTime() > max.getTime()) {
      max = value;
    }
  }
  return max;
}

function normalizeTimezone(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildRuleFromWeeklyConfig(input: {
  timezone: string;
  days: Array<{ weekday: number; templateId: string | null; isActive: boolean }>;
  templatesById: Map<string, { startLocal: string; endLocal: string; breaks: ScheduleBreakInterval[] }>;
}): ReturnType<typeof buildScheduleRuleConfig> {
  if (input.days.length === 0) return null;
  const dayByWeekday = new Map<number, { templateId: string | null; isActive: boolean }>();
  for (const day of input.days) {
    dayByWeekday.set(day.weekday, { templateId: day.templateId, isActive: day.isActive });
  }

  const weekly = Array.from({ length: 7 }, (_, index) => {
    const systemDay = index as DayOfWeek;
    const scheduleWeekday = systemDay === 0 ? 7 : systemDay;
    const day = dayByWeekday.get(scheduleWeekday) ?? null;
    const template = day?.templateId ? input.templatesById.get(day.templateId) ?? null : null;
    const isWorkday = Boolean(day?.isActive && template);

    return {
      dayOfWeek: systemDay,
      isWorkday,
      startLocal: isWorkday ? template?.startLocal ?? null : null,
      endLocal: isWorkday ? template?.endLocal ?? null : null,
      breaks: isWorkday ? template?.breaks ?? [] : [],
    };
  });

  const hasAnyWorkday = weekly.some((item) => item.isWorkday);
  if (!hasAnyWorkday) return null;

  return {
    kind: "WEEKLY",
    timezone: input.timezone,
    anchorDate: null,
    payload: { weekly },
  };
}

function dateKeyToUtcStart(dateKey: string): Date {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) {
    throw new AppError(`Invalid date key: ${dateKey}`, 400, "DATE_INVALID");
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

async function resolveScheduleVersion(masterId: string): Promise<ScheduleVersion> {
  const [provider, rule, weeklyMax, overrideMax, breakMax, blockMax, templateMax, weeklyConfigMax] =
    await prisma.$transaction([
    prisma.provider.findUnique({
      where: { id: masterId },
      select: { updatedAt: true },
    }),
    prisma.scheduleRule.findFirst({
      where: { providerId: masterId, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.weeklySchedule.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.scheduleOverride.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.scheduleBreak.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.scheduleBlock.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.scheduleTemplate.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.weeklyScheduleConfig.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
  ]);

  const latest = maxDate([
    provider?.updatedAt ?? null,
    rule?.updatedAt ?? null,
    weeklyMax._max.updatedAt ?? null,
    overrideMax._max.updatedAt ?? null,
    breakMax._max.updatedAt ?? null,
    blockMax._max.updatedAt ?? null,
    templateMax._max.updatedAt ?? null,
    weeklyConfigMax._max.updatedAt ?? null,
  ]);

  const value = latest ? String(latest.getTime()) : "0";
  return { value, updatedAt: latest };
}

export async function getScheduleWindow(masterId: string, timeZone: string): Promise<ScheduleWindow> {
  const version = await resolveScheduleVersion(masterId);
  const publishedUntilLocal = resolvePublishedUntilLocal({
    changeAtUtc: version.updatedAt,
    nowUtc: new Date(),
    timeZone,
  });
  return {
    scheduleVersion: version.value,
    publishedUntilLocal,
    scheduleUpdatedAt: version.updatedAt,
  };
}

export async function createScheduleContext(input: {
  providerId: string;
  timezoneHint?: string;
  range?: { fromKey: string; toKeyExclusive: string };
}): Promise<ScheduleContext> {
  const provider = await prisma.provider.findUnique({
    where: { id: input.providerId },
    select: { id: true, timezone: true },
  });
  if (!provider) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  const timezone = normalizeTimezone(input.timezoneHint, provider.timezone);
  const scheduleWindow = await getScheduleWindow(provider.id, timezone);

  const [rule, weeklyRows, weeklyBreaks, weeklyConfig, templates] = await prisma.$transaction([
    prisma.scheduleRule.findFirst({
      where: { providerId: provider.id, isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: {
        kind: true,
        timezone: true,
        anchorDate: true,
        payloadJson: true,
        isActive: true,
        updatedAt: true,
      },
    }),
    prisma.weeklySchedule.findMany({
      where: { providerId: provider.id },
      select: { dayOfWeek: true, startLocal: true, endLocal: true },
      orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
    }),
    prisma.scheduleBreak.findMany({
      where: { providerId: provider.id, kind: "WEEKLY" },
      select: { kind: true, dayOfWeek: true, date: true, startLocal: true, endLocal: true },
    }),
    prisma.weeklyScheduleConfig.findUnique({
      where: { providerId: provider.id },
      select: {
        id: true,
        days: { select: { weekday: true, templateId: true, isActive: true } },
      },
    }),
    prisma.scheduleTemplate.findMany({
      where: { providerId: provider.id },
      select: {
        id: true,
        startLocal: true,
        endLocal: true,
        breaks: { select: { startLocal: true, endLocal: true, sortOrder: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const templatesById = new Map<string, { startLocal: string; endLocal: string; breaks: ScheduleBreakInterval[] }>();
  templates.forEach((template) => {
    templatesById.set(template.id, {
      startLocal: template.startLocal,
      endLocal: template.endLocal,
      breaks: template.breaks
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({ startLocal: item.startLocal, endLocal: item.endLocal })),
    });
  });

  const unifiedRuleConfig = weeklyConfig
    ? buildRuleFromWeeklyConfig({
        timezone,
        days: weeklyConfig.days.map((day) => ({
          weekday: day.weekday,
          templateId: day.templateId,
          isActive: day.isActive,
        })),
        templatesById,
      })
    : null;

  const ruleConfig = unifiedRuleConfig ?? buildScheduleRuleConfig({
    providerTimezone: timezone,
    activeRule: (rule as ActiveRuleRecord | null) ?? null,
    weeklyRows: weeklyRows as WeeklyRow[],
    breakRows: weeklyBreaks as BreakRow[],
  });

  let overrides: OverrideRow[] = [];
  let blocks: BlockRow[] = [];
  let overrideBreaks: BreakRow[] = [];

  if (input.range) {
    const fromUtc = dateKeyToUtcStart(input.range.fromKey);
    const toUtcExclusive = dateKeyToUtcStart(input.range.toKeyExclusive);

    const [overrideRows, blockRows, breakRows] = await prisma.$transaction([
      prisma.scheduleOverride.findMany({
        where: { providerId: provider.id, date: { gte: fromUtc, lt: toUtcExclusive } },
        select: {
          date: true,
          kind: true,
          isDayOff: true,
          startLocal: true,
          endLocal: true,
          templateId: true,
          isActive: true,
          note: true,
          reason: true,
        },
      }),
      prisma.scheduleBlock.findMany({
        where: { providerId: provider.id, date: { gte: fromUtc, lt: toUtcExclusive } },
        select: { date: true, startLocal: true, endLocal: true },
      }),
      prisma.scheduleBreak.findMany({
        where: {
          providerId: provider.id,
          kind: "OVERRIDE",
          date: { gte: fromUtc, lt: toUtcExclusive },
        },
        select: { kind: true, dayOfWeek: true, date: true, startLocal: true, endLocal: true },
      }),
    ]);

    overrides = overrideRows as OverrideRow[];
    blocks = blockRows as BlockRow[];
    overrideBreaks = breakRows as BreakRow[];
  }

  const overridesByDateKey = new Map<string, OverrideRow[]>();
  for (const row of overrides) {
    const key = toLocalDateKey(row.date, timezone);
    const list = overridesByDateKey.get(key) ?? [];
    list.push(row);
    overridesByDateKey.set(key, list);
  }

  const blocksByDateKey = new Map<string, BlockRow[]>();
  for (const row of blocks) {
    const key = toLocalDateKey(row.date, timezone);
    const list = blocksByDateKey.get(key) ?? [];
    list.push(row);
    blocksByDateKey.set(key, list);
  }

  const breaksOverrideByDateKey = new Map<string, BreakRow[]>();
  for (const row of overrideBreaks) {
    if (!row.date) continue;
    const key = toLocalDateKey(row.date, timezone);
    const list = breaksOverrideByDateKey.get(key) ?? [];
    list.push(row);
    breaksOverrideByDateKey.set(key, list);
  }

  return {
    providerId: provider.id,
    timezone,
    scheduleWindow,
    rule: ruleConfig,
    overridesByDateKey,
    blocksByDateKey,
    breaksWeekly: weeklyBreaks as BreakRow[],
    breaksOverrideByDateKey,
    templatesById,
  };
}
