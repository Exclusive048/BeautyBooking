import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { resolveDayPlanFromRule } from "@/lib/schedule/engine-core";
import { applyPublishHorizon } from "@/lib/schedule/publish-horizon";
import type { DayPlan } from "@/lib/schedule/types";
import { buildDayPlanCacheKey, getCachedDayPlan, setCachedDayPlan } from "@/lib/schedule/dayPlanCache";
import { toScheduleOverrideConfigs } from "@/lib/schedule/rule-adapters";
import type { ScheduleContext } from "@/lib/schedule/engine-context";
import { createScheduleContext, getScheduleWindow } from "@/lib/schedule/engine-context";

export const ScheduleEngine = {
  getScheduleWindow,
  createContext: createScheduleContext,

  async getDayPlanFromContext(ctx: ScheduleContext, dateKey: string): Promise<DayPlan> {
    const cacheKey = buildDayPlanCacheKey(
      ctx.providerId,
      dateKey,
      ctx.timezone,
      ctx.scheduleWindow.scheduleVersion,
      ctx.scheduleWindow.publishedUntilLocal
    );
    const cached = await getCachedDayPlan(cacheKey);
    if (cached) return cached;

    const overrides = ctx.overridesByDateKey.get(dateKey) ?? [];
    const breaksByDateKey = new Map(
      Array.from(ctx.breaksOverrideByDateKey.entries()).map(([key, list]) => [
        key,
        list.map((row) => ({ startLocal: row.startLocal, endLocal: row.endLocal })),
      ])
    );
    const overrideConfigs = toScheduleOverrideConfigs(overrides, {
      timezone: ctx.timezone,
      templatesById: ctx.templatesById,
      breaksByDateKey,
    });
    const dateBreaks = breaksByDateKey.get(dateKey) ?? [];
    const blockBreaks = (ctx.blocksByDateKey.get(dateKey) ?? []).map((row) => ({
      start: row.startLocal,
      end: row.endLocal,
    }));

    const plan = resolveDayPlanFromRule({
      dateKey,
      rule: ctx.rule,
      overrides: overrideConfigs,
      dateBreaks,
      blockBreaks,
      providerTimezone: ctx.timezone,
    });
    const gated = applyPublishHorizon({
      plan,
      dateKey,
      publishedUntilLocal: ctx.scheduleWindow.publishedUntilLocal,
    });

    await setCachedDayPlan(cacheKey, gated);
    return gated;
  },

  async getDayPlan(input: { masterId: string; date: string; timezone: string }): Promise<DayPlan> {
    const ctx = await createScheduleContext({
      providerId: input.masterId,
      timezoneHint: input.timezone,
      range: { fromKey: input.date, toKeyExclusive: addDaysToDateKey(input.date, 1) },
    });
    return ScheduleEngine.getDayPlanFromContext(ctx, input.date);
  },
};
