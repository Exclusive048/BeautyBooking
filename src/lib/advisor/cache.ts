import { del, get, set } from "@/lib/cache/cache";
import type { AdvisorInsight } from "@/lib/advisor/types";
import { computeAdvisorInsights } from "@/lib/advisor/engine";
import { withSingleFlight } from "@/lib/cache/single-flight";

export const ADVISOR_CACHE_TTL = 60 * 60 * 24;

type AdvisorCachePayload = {
  insights: AdvisorInsight[];
  computedAt: string;
};

function buildAdvisorCacheKey(providerId: string): string {
  return `advisor:master:${providerId}`;
}

export async function getAdvisorInsights(providerId: string): Promise<AdvisorCachePayload> {
  const key = buildAdvisorCacheKey(providerId);
  const cached = await get<AdvisorCachePayload>(key);
  if (cached) return cached;

  // PERF-10: советник считается по всей истории кабинета и живёт сутки —
  // то есть промах редкий, но дорогой, и без замка его оплачивают все
  // параллельные запросы разом.
  return withSingleFlight<AdvisorCachePayload>({
    lockKey: `sf:${key}`,
    read: () => get<AdvisorCachePayload>(key),
    compute: async () => {
      const insights = await computeAdvisorInsights(providerId);
      const payload: AdvisorCachePayload = {
        insights,
        computedAt: new Date().toISOString(),
      };
      await set(key, payload, ADVISOR_CACHE_TTL);
      return payload;
    },
  });
}

export async function refreshAdvisorInsights(providerId: string): Promise<AdvisorCachePayload> {
  const insights = await computeAdvisorInsights(providerId);
  const payload: AdvisorCachePayload = {
    insights,
    computedAt: new Date().toISOString(),
  };
  await set(buildAdvisorCacheKey(providerId), payload, ADVISOR_CACHE_TTL);
  return payload;
}

export async function invalidateAdvisorCache(providerId: string): Promise<void> {
  await del(buildAdvisorCacheKey(providerId));
}
