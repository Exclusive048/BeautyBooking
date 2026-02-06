import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { buildDateBreaksMap, buildScheduleRuleConfig, toScheduleOverrideConfigs } from "@/lib/schedule/rule-adapters";
import { resolveDayPlanFromRule } from "@/lib/schedule/engine-core";
import { applyPublishHorizon, resolvePublishedUntilLocal } from "@/lib/schedule/publish-horizon";
import type { DayPlan } from "@/lib/schedule/types";
import { buildDayPlanCacheKey, getCachedDayPlan, setCachedDayPlan } from "@/lib/schedule/dayPlanCache";

type ScheduleVersion = {
  value: string;
  updatedAt: Date | null;
};

type ActiveRuleRecord = {
  kind: "WEEKLY" | "CYCLE";
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
  updatedAt: Date;
};

type OverrideRow = {
  date: Date;
  kind: "OFF" | "TIME_RANGE";
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  note: string | null;
  reason: string | null;
  updatedAt: Date;
};

type BreakRow = {
  kind: "WEEKLY" | "OVERRIDE";
  dayOfWeek: number | null;
  date: Date | null;
  startLocal: string;
  endLocal: string;
  updatedAt: Date;
};

type BlockRow = {
  date: Date;
  startLocal: string;
  endLocal: string;
  updatedAt: Date;
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

async function resolveScheduleVersion(masterId: string): Promise<ScheduleVersion> {
  const [provider, rule, weeklyMax, overrideMax, breakMax, blockMax] = await prisma.$transaction([
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
  ]);

  const latest = maxDate([
    provider?.updatedAt ?? null,
    rule?.updatedAt ?? null,
    weeklyMax._max.updatedAt ?? null,
    overrideMax._max.updatedAt ?? null,
    breakMax._max.updatedAt ?? null,
    blockMax._max.updatedAt ?? null,
  ]);

  const value = latest ? String(latest.getTime()) : "0";
  return { value, updatedAt: latest };
}


type ScheduleWindow = {
  scheduleVersion: string;
  publishedUntilLocal: string;
  scheduleUpdatedAt: Date | null;
};

export const ScheduleEngine = {
  async getScheduleWindow(masterId: string, timeZone: string): Promise<ScheduleWindow> {
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
  },

  async getDayPlan(input: { masterId: string; date: string; timezone: string }): Promise<DayPlan> {
    const scheduleVersion = await resolveScheduleVersion(input.masterId);
    const provider = await prisma.provider.findUnique({
      where: { id: input.masterId },
      select: { id: true, timezone: true },
    });
    if (!provider) {
      throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
    }
    const timezone = input.timezone.trim() ? input.timezone.trim() : provider.timezone;
    const publishedUntilLocal = resolvePublishedUntilLocal({
      changeAtUtc: scheduleVersion.updatedAt,
      nowUtc: new Date(),
      timeZone: timezone,
    });
    const cacheKey = buildDayPlanCacheKey(
      input.masterId,
      input.date,
      timezone,
      scheduleVersion.value,
      publishedUntilLocal
    );
    const cached = await getCachedDayPlan(cacheKey);
    if (cached) return cached;

    const dateUtc = new Date(`${input.date}T00:00:00.000Z`);

    const [rule, weeklyRows, overrides, breakRows, blocks] = await prisma.$transaction([
      prisma.scheduleRule.findFirst({
        where: { providerId: input.masterId, isActive: true },
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
        where: { providerId: input.masterId },
        select: { dayOfWeek: true, startLocal: true, endLocal: true, updatedAt: true },
        orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
      }),
      prisma.scheduleOverride.findMany({
        where: { providerId: input.masterId, date: dateUtc },
        select: {
          date: true,
          kind: true,
          isDayOff: true,
          startLocal: true,
          endLocal: true,
          note: true,
          reason: true,
          updatedAt: true,
        },
      }),
      prisma.scheduleBreak.findMany({
        where: {
          providerId: input.masterId,
          OR: [{ kind: "WEEKLY" }, { kind: "OVERRIDE", date: dateUtc }],
        },
        select: { kind: true, dayOfWeek: true, date: true, startLocal: true, endLocal: true, updatedAt: true },
      }),
      prisma.scheduleBlock.findMany({
        where: { providerId: input.masterId, date: dateUtc },
        select: { date: true, startLocal: true, endLocal: true, updatedAt: true },
      }),
    ]);

    const ruleConfig = buildScheduleRuleConfig({
      providerTimezone: timezone,
      activeRule: (rule as ActiveRuleRecord | null) ?? null,
      weeklyRows: weeklyRows as WeeklyRow[],
      breakRows: breakRows as BreakRow[],
    });

    const overrideConfigs = toScheduleOverrideConfigs(overrides as OverrideRow[]);
    const dateBreaksMap = buildDateBreaksMap(breakRows as BreakRow[], ruleConfig?.timezone ?? timezone);
    const plan = resolveDayPlanFromRule({
      dateKey: input.date,
      rule: ruleConfig,
      overrides: overrideConfigs,
      dateBreaks: dateBreaksMap.get(input.date) ?? [],
      blockBreaks: (blocks as BlockRow[]).map((block) => ({ start: block.startLocal, end: block.endLocal })),
      providerTimezone: timezone,
    });
    const gated = applyPublishHorizon({
      plan,
      dateKey: input.date,
      publishedUntilLocal,
    });

    await setCachedDayPlan(cacheKey, gated);
    return gated;
  },
};
