// SEC-04 by-photo (AUDIT-CAMPAIGN-02 п.7) — защита стоимости анонимного
// визуального поиска БЕЗ изменения флоу (поверхность остаётся анонимной,
// капчи/сессии нет — ратифицировано владельцем).
//
// Три слоя (порядок в роуте: тир → флаг → файл → ДЕДУП → БЮДЖЕТ → провайдер):
//   1. per-IP тир ужесточён в самом роуте (10/60с → 3/60с);
//   2. дедуп по sha256 файла: повторный поиск тем же изображением отдаёт
//      кэшированный ответ и НЕ тратит ни бюджет, ни vision/embedding-вызовы.
//      В ключе Redis — хеш, не содержимое (прецедент lib/maps/address-cache:
//      пользовательские данные в имени ключа не живут);
//   3. глобальный суточный бюджет запросов на инстанс — переиспользует
//      checkRateLimit (окно 24 ч, ключ несёт UTC-дату → новый день = новый
//      счётчик, старый умирает по TTL). Один запрос = 2 vision + 1 embedding,
//      поэтому считаем ЗАПРОСЫ — понятнее и дешевле, чем считать вызовы.
//
// Дата бюджета — UTC-tech (rule 17): это инстансовый технический счётчик,
// пользовательского времени здесь нет. Работает при выключенном
// VISUAL_SEARCH_ENABLED (модуль не зависит от флага) — включение флага
// доработок не требует.
//
// Деградация при недоступном Redis НАСЛЕДУЕТСЯ от checkRateLimit и осознанно
// не ужесточается: в production — bounded memory fallback (счёт продолжается
// в памяти процесса), в dev/test — fail-open (§8 снапшота: «rate-limit
// fail-open в dev — приемлемо»). Это защита стоимости, а не безопасности —
// fail-closed здесь глушил бы фичу целиком из-за моргнувшего Redis.

import { createHash } from "crypto";
import { get as cacheGet, set as cacheSet } from "@/lib/cache/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import type { VisualSearchHttpResponse } from "@/lib/visual-search/contracts";

/** Суточный потолок поисковых запросов на инстанс (не на IP). */
export const VISUAL_SEARCH_DAILY_BUDGET = 200;

const BUDGET_WINDOW_SECONDS = 24 * 60 * 60;
const RESULT_CACHE_TTL_SECONDS = 24 * 60 * 60;

export function visualSearchBudgetKey(now: Date = new Date()): string {
  return `rl:visual-search:budget:global:${now.toISOString().slice(0, 10)}`;
}

export async function takeVisualSearchDailyBudget(
  now: Date = new Date(),
  budget: number = VISUAL_SEARCH_DAILY_BUDGET,
): Promise<{ limited: boolean }> {
  const result = await checkRateLimit(visualSearchBudgetKey(now), {
    windowSeconds: BUDGET_WINDOW_SECONDS,
    maxRequests: budget,
  });
  return { limited: result.limited };
}

/** Секунд до конца UTC-суток — Retry-After для честного 429 при исчерпании. */
export function secondsToUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export function byPhotoImageHash(image: Uint8Array): string {
  return createHash("sha256").update(image).digest("hex");
}

const resultCacheKey = (imageHash: string) => `vs:by-photo:result:${imageHash}`;

export async function getCachedByPhotoResult(
  imageHash: string,
): Promise<VisualSearchHttpResponse | null> {
  return cacheGet<VisualSearchHttpResponse>(resultCacheKey(imageHash));
}

export async function setCachedByPhotoResult(
  imageHash: string,
  result: VisualSearchHttpResponse,
): Promise<void> {
  await cacheSet(resultCacheKey(imageHash), result, RESULT_CACHE_TTL_SECONDS);
}
