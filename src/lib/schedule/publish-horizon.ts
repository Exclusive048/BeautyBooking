import { addDaysToDateKey, compareDateKeys } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { DayPlan } from "@/lib/schedule/types";

export const PUBLISH_HORIZON_WEEKS = 6;

/**
 * Rolling 42-day publish horizon anchored to **now**, not last schedule edit.
 *
 * `changeAtUtc` remains in the signature because callers thread it through
 * `scheduleVersion` for cache invalidation — but the horizon itself rolls
 * forward with the clock. Otherwise a master who set a schedule once and
 * stopped touching it would silently lose slots 42 days later.
 */
export function resolvePublishedUntilLocal(input: {
  changeAtUtc: Date | null;
  nowUtc: Date;
  timeZone: string;
}): string {
  const baseKey = toLocalDateKey(input.nowUtc, input.timeZone);
  return addDaysToDateKey(baseKey, PUBLISH_HORIZON_WEEKS * 7);
}

export function applyPublishHorizon(input: {
  plan: DayPlan;
  dateKey: string;
  publishedUntilLocal: string;
}): DayPlan {
  if (compareDateKeys(input.dateKey, input.publishedUntilLocal) <= 0) {
    return {
      ...input.plan,
      meta: {
        ...input.plan.meta,
        publishedUntilLocal: input.publishedUntilLocal,
      },
    };
  }

  return {
    isWorking: false,
    workingIntervals: [],
    breaks: [],
    meta: {
      ...input.plan.meta,
      reason: "out_of_publish_horizon",
      publishedUntilLocal: input.publishedUntilLocal,
    },
  };
}
