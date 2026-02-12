import type { ScheduleBreakInterval } from "@/lib/domain/schedule";
import type { ScheduleOverrideConfig, ScheduleRuleConfig } from "@/lib/schedule/rule-engine";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { resolveDayScheduleFromRule } from "@/lib/schedule/resolve";
import type { DayPlan } from "@/lib/schedule/types";

type ResolveInput = {
  dateKey: string;
  rule: ScheduleRuleConfig | null;
  overrides: ScheduleOverrideConfig[];
  dateBreaks?: ScheduleBreakInterval[];
  blockBreaks?: Array<{ start: string; end: string }>;
  providerTimezone: string;
};

function resolveMetaSource(input: { rule: ScheduleRuleConfig | null; hasOverride: boolean }): DayPlan["meta"] {
  if (input.hasOverride) {
    return { source: "override" };
  }
  if (input.rule?.kind === "CYCLE") {
    return { source: "cycle" };
  }
  return { source: "weekly-template" };
}

export function resolveDayPlanFromRule(input: ResolveInput): DayPlan {
  const timezone = input.rule?.timezone ?? input.providerTimezone;
  const workday = resolveDayScheduleFromRule({
    dateKey: input.dateKey,
    rule: input.rule,
    overrides: input.overrides,
    dateBreaks: input.dateBreaks ?? [],
    providerTimezone: input.providerTimezone,
  });

  const hasOverride = input.overrides.some((item) => toLocalDateKey(item.date, timezone) === input.dateKey);
  const extraBreaks = input.blockBreaks ?? [];

  if (!workday.isWorking || !workday.startLocal || !workday.endLocal) {
    return {
      isWorking: false,
      workingIntervals: [],
      breaks: extraBreaks,
      meta: resolveMetaSource({ rule: input.rule, hasOverride }),
    };
  }

  return {
    isWorking: true,
    workingIntervals: [{ start: workday.startLocal, end: workday.endLocal }],
    breaks: [...workday.breaks.map((item) => ({ start: item.startLocal, end: item.endLocal })), ...extraBreaks],
    meta: resolveMetaSource({ rule: input.rule, hasOverride }),
  };
}
