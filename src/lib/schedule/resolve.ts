import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import type { ScheduleBreakInterval } from "@/lib/domain/schedule";
import { dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import type { ScheduleOverrideConfig, ScheduleRuleConfig } from "@/lib/schedule/rule-engine";
import { getProviderWorkday } from "@/lib/schedule/rule-engine";
import type { ScheduleContext } from "@/lib/schedule/engine-context";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { toScheduleOverrideConfigs } from "@/lib/schedule/rule-adapters";

export type ResolvedDaySchedule = {
  isWorking: boolean;
  startLocal: string | null;
  endLocal: string | null;
  breaks: ScheduleBreakInterval[];
};

export function resolveDayScheduleFromRule(input: {
  dateKey: string;
  rule: ScheduleRuleConfig | null;
  overrides: ScheduleOverrideConfig[];
  dateBreaks?: ScheduleBreakInterval[];
  providerTimezone: string;
}): ResolvedDaySchedule {
  const timezone = input.rule?.timezone ?? input.providerTimezone;
  const dateForLocal = dateFromLocalDateKey(input.dateKey, timezone);
  const workday = getProviderWorkday({
    date: dateForLocal,
    rule: input.rule,
    overrides: input.overrides,
    dateBreaks: input.dateBreaks ?? [],
  });

  return {
    isWorking: workday.isWorkday,
    startLocal: workday.startLocal,
    endLocal: workday.endLocal,
    breaks: workday.breaks,
  };
}

export function resolveDayScheduleFromContext(ctx: ScheduleContext, dateKey: string): ResolvedDaySchedule {
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

  return resolveDayScheduleFromRule({
    dateKey,
    rule: ctx.rule,
    overrides: overrideConfigs,
    dateBreaks: breaksByDateKey.get(dateKey) ?? [],
    providerTimezone: ctx.timezone,
  });
}

export async function resolveDaySchedule(input: {
  providerId: string;
  dateKey: string;
  timezoneHint?: string;
}): Promise<ResolvedDaySchedule> {
  const ctx = await createScheduleContext({
    providerId: input.providerId,
    timezoneHint: input.timezoneHint,
    range: { fromKey: input.dateKey, toKeyExclusive: addDaysToDateKey(input.dateKey, 1) },
  });
  return resolveDayScheduleFromContext(ctx, input.dateKey);
}
