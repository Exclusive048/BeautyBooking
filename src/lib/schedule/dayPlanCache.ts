import * as cache from "@/lib/cache/cache";
import type { DayPlan } from "@/lib/schedule/types";

const DAY_PLAN_TTL_SECONDS = 120;

export function buildDayPlanCacheKey(
  masterId: string,
  dateKey: string,
  timeZone: string,
  scheduleVersion: string,
  publishedUntilLocal: string
): string {
  return `dayPlan:${masterId}:${dateKey}:${timeZone}:${scheduleVersion}:${publishedUntilLocal}`;
}

export async function getCachedDayPlan(key: string): Promise<DayPlan | null> {
  return cache.get<DayPlan>(key);
}

export async function setCachedDayPlan(key: string, plan: DayPlan): Promise<void> {
  await cache.set(key, plan, DAY_PLAN_TTL_SECONDS);
}
