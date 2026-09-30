import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { resolveDayPlanFromRule } from "@/lib/schedule/engine-core";
import { applyPublishHorizon } from "@/lib/schedule/publish-horizon";
import type { DayPlan } from "@/lib/schedule/types";
import { buildDayPlanCacheKey, getCachedDayPlan, setCachedDayPlan } from "@/lib/schedule/dayPlanCache";
import { toScheduleOverrideConfigs } from "@/lib/schedule/rule-adapters";
import type { ScheduleContext } from "@/lib/schedule/engine-context";
import {
  UNCACHED_SCHEDULE_VERSION,
  createScheduleContext,
  getScheduleWindow,
} from "@/lib/schedule/engine-context";

export const ScheduleEngine = {
  getScheduleWindow,
  createContext: createScheduleContext,

  async getDayPlanFromContext(ctx: ScheduleContext, dateKey: string): Promise<DayPlan> {
    // Пакетный контекст (`createScheduleContexts`) версии расписания не знает —
    // ключ кэша из него не построить, поэтому считаем напрямую.
    if (ctx.scheduleWindow.scheduleVersion === UNCACHED_SCHEDULE_VERSION) {
      return ScheduleEngine.computeDayPlan(ctx, dateKey);
    }

    const cacheKey = buildDayPlanCacheKey(
      ctx.providerId,
      dateKey,
      ctx.timezone,
      ctx.scheduleWindow.scheduleVersion,
      ctx.scheduleWindow.publishedUntilLocal
    );
    const cached = await getCachedDayPlan(cacheKey);
    if (cached) return cached;

    // PERF-10 намеренно НЕ ставит здесь single-flight-замок, хотя шаблон тот
    // же. Всё, что ниже, — чистый расчёт из УЖЕ загруженного контекста: ни
    // одного обращения к БД. Замок стоил бы двух-трёх round-trip'ов к Redis
    // ради экономии микросекунд CPU, то есть сделал бы промах дороже, а не
    // дешевле. Замок оправдан там, где промах стоит запросов к БД — слоты,
    // booking-days, советник.
    const gated = ScheduleEngine.computeDayPlan(ctx, dateKey);
    await setCachedDayPlan(cacheKey, gated);
    return gated;
  },

  /**
   * План дня из УЖЕ загруженного контекста — чистый расчёт без кэша и без БД.
   * SCHEDULE-PATTERNS-01: отдельно от `getDayPlanFromContext`, чтобы пакетные
   * читатели (много профилей × много дней) не ходили в Redis за каждым днём.
   */
  computeDayPlan(ctx: ScheduleContext, dateKey: string): DayPlan {
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

    const plan = resolveDayPlanFromRule({
      dateKey,
      rule: ctx.rule,
      overrides: overrideConfigs,
      dateBreaks,
      providerTimezone: ctx.timezone,
    });
    return applyPublishHorizon({
      plan,
      dateKey,
      publishedUntilLocal: ctx.scheduleWindow.publishedUntilLocal,
    });
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
