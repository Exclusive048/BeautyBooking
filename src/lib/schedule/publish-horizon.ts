import { addDaysToDateKey, compareDateKeys } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { DayPlan } from "@/lib/schedule/types";

/**
 * SCHEDULE-PATTERNS-01 (решение владельца 2026-09-28): расписание настраивается
 * и открыто для записи максимум на 3 месяца вперёд. Одно число на всё — горизонт
 * публикации дней, потолок «Максимум вперёд» в правилах записи
 * (`BOOKING_RULE_LIMITS`) и окно записи (`latestBookableUtc`).
 *
 * До этого горизонт был 6 недель и ни с чем не был связан: в «Видимости» можно
 * было выбрать 90 дней, в правилах — до 365, а всё дальше 42-го дня молча
 * оставалось закрытым.
 */
export const SCHEDULE_HORIZON_DAYS = 92;

/**
 * Rolling publish horizon (`SCHEDULE_HORIZON_DAYS`) anchored to **now**, not last schedule edit.
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
  return addDaysToDateKey(baseKey, SCHEDULE_HORIZON_DAYS);
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
