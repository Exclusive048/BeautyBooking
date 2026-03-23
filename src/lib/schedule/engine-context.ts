import type { ScheduleOverrideKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { resolvePublishedUntilLocal } from "@/lib/schedule/publish-horizon";
import { parseDateKeyParts } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { DayOfWeek, ScheduleBreakInterval } from "@/lib/domain/schedule";

type ScheduleVersion = {
  value: string;
  updatedAt: Date | null;
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
  rule: {
    kind: "WEEKLY";
    timezone: string;
    anchorDate: null;
    payload: {
      weekly: Array<{
        dayOfWeek: DayOfWeek;
        isWorkday: boolean;
        startLocal: string | null;
        endLocal: string | null;
        breaks: ScheduleBreakInterval[];
      }>;
    };
  } | null;
  overridesByDateKey: Map<string, OverrideRow[]>;
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
}): ScheduleContext["rule"] {
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
  const [provider, overrideMax, overrideBreakMax, templateMax, weeklyConfigMax] =
    await prisma.$transaction([
    prisma.provider.findUnique({
      where: { id: masterId },
      select: { updatedAt: true },
    }),
    prisma.scheduleOverride.aggregate({
      where: { providerId: masterId },
      _max: { updatedAt: true },
    }),
    prisma.scheduleBreak.aggregate({
      where: { providerId: masterId, kind: "OVERRIDE" },
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
    overrideMax._max.updatedAt ?? null,
    overrideBreakMax._max.updatedAt ?? null,
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

  const [weeklyConfig, templates] = await prisma.$transaction([
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

  const ruleConfig = unifiedRuleConfig;

  let overrides: OverrideRow[] = [];
  let overrideBreaks: BreakRow[] = [];

  if (input.range) {
    const fromUtc = dateKeyToUtcStart(input.range.fromKey);
    const toUtcExclusive = dateKeyToUtcStart(input.range.toKeyExclusive);

    const [overrideRows, breakRows] = await prisma.$transaction([
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
      prisma.scheduleBreak.findMany({
        where: {
          providerId: provider.id,
          kind: "OVERRIDE",
          date: { gte: fromUtc, lt: toUtcExclusive },
        },
        select: { date: true, startLocal: true, endLocal: true },
      }),
    ]);

    overrides = overrideRows as OverrideRow[];
    overrideBreaks = breakRows as BreakRow[];
  }

  const overridesByDateKey = new Map<string, OverrideRow[]>();
  for (const row of overrides) {
    const key = toLocalDateKey(row.date, timezone);
    const list = overridesByDateKey.get(key) ?? [];
    list.push(row);
    overridesByDateKey.set(key, list);
  }

  const breaksOverrideByDateKey = new Map<string, BreakRow[]>();
  for (const row of overrideBreaks) {
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
    breaksOverrideByDateKey,
    templatesById,
  };
}
