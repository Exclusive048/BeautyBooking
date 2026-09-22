// SEC-04 by-photo (AUDIT-CAMPAIGN-02 п.7) — защита стоимости анонимного
// визуального поиска БЕЗ изменения флоу (поверхность остаётся анонимной,
// капчи/сессии нет — ратифицировано владельцем).
//
// Слои (порядок в роуте: тир → флаг → файл → ДЕДУП → провайдер, где потолок
// стоит уже внутри провайдера):
//   1. per-IP тир ужесточён в самом роуте (10/60с → 3/60с);
//   2. дедуп по sha256 файла: повторный поиск тем же изображением отдаёт
//      кэшированный ответ и НЕ тратит ни бюджет, ни vision/embedding-вызовы.
//      В ключе Redis — хеш, не содержимое (прецедент lib/maps/address-cache:
//      пользовательские данные в имени ключа не живут);
//   3. суточный денежный потолок — **переехал в `lib/ai/spend-ceiling.ts`**
//      (FIX-B16), см. ниже.
//
// ───────────────────────────────────────────────────────────────────────────
// FIX-B16 — решение SEC-04 УТОЧНЕНО, а не отменено.
//
// Прежний текст этого заголовка говорил: деградация наследуется от
// `checkRateLimit` и «осознанно не ужесточается», потому что fail-closed глушил
// бы фичу из-за моргнувшего Redis. **Это рассуждение остаётся в силе — для
// частотного лимита.** Слои 1 и 2 не тронуты: 3/60с на IP по-прежнему уходит в
// memory-fallback (prod) / fail-open (dev), ровно как ратифицировано.
//
// Изменилось разделение контролей. Частотный лимит и денежный потолок — разные
// вещи с разной ценой отказа: провалившийся открытым частотный лимит стоит
// лишних запросов, провалившийся открытым денежный потолок стоит неограниченных
// денег, а потолок, который обнуляется рестартом процесса, потолком не является
// вовсе. Прежний суточный бюджет жил в Redis через `checkRateLimit`, то есть при
// обрыве кэша умножался на число процессов и сбрасывался каждым деплоем. Сегодня
// это ничего не стоит (фича спит за `VISUAL_SEARCH_ENABLED`), а в день флипа
// стоило бы ровно столько, сколько успеет потратить включённая фича.
//
// Поэтому потолок теперь durable (Postgres, `AiSpendCounter`) и живёт в
// ЧОКПОЙНТЕ провайдера, а не здесь: у пути ИНДЕКСАЦИИ запроса нет вовсе
// (воркер), и роут-уровневый счётчик его покрыть не мог физически. Ратифицированное
// число сохранено по смыслу: 200 запросов = 600 платных вызовов
// (classify + describe + query-embedding), см. `AI_SPEND_CEILINGS`.
// ───────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";
import { get as cacheGet, set as cacheSet } from "@/lib/cache/cache";
import type { VisualSearchHttpResponse } from "@/lib/visual-search/contracts";

const RESULT_CACHE_TTL_SECONDS = 24 * 60 * 60;

export function byPhotoImageHash(image: Uint8Array): string {
  return createHash("sha256").update(image).digest("hex");
}

const resultCacheKey = (imageHash: string) => `vs:by-photo:result:${imageHash}`;

export async function getCachedByPhotoResult(
  imageHash: string,
): Promise<VisualSearchHttpResponse | null> {
  return cacheGet<VisualSearchHttpResponse>(resultCacheKey(imageHash));
}

/**
 * VISUAL-SEARCH-CACHE-01 — сколько держать ответ, по его исходу.
 *
 * 🔴 Раньше сутки держался ЛЮБОЙ ответ, включая те, что зависят не от фото, а
 * от состояния системы: «пока мало работ» (индекс растёт — мастер загрузил
 * портфолио, и через час поиск уже нашёл бы его) и отказ провайдера (сбой
 * проходит за минуты). Пользователь, повторивший тот же поиск, до завтра видел
 * прежний отказ.
 *   · выдача и «не распознали / нечётко» — свойство самого фото → сутки;
 *   · «мало работ» — короткое окно: дедуп всё ещё гасит серию повторов (ради
 *     него слой и заведён), но рост индекса виден в пределах минут;
 *   · провайдер не ответил → не кэшируется вовсе.
 */
const NOT_ENOUGH_INDEXED_TTL_SECONDS = 10 * 60;

export function byPhotoCacheTtlSeconds(result: VisualSearchHttpResponse): number | null {
  if (result.ok) return RESULT_CACHE_TTL_SECONDS;
  switch (result.reason) {
    case "unrecognized":
    case "low_confidence":
      return RESULT_CACHE_TTL_SECONDS;
    case "not_enough_indexed":
      return NOT_ENOUGH_INDEXED_TTL_SECONDS;
    case "unavailable":
      return null;
  }
}

export async function setCachedByPhotoResult(
  imageHash: string,
  result: VisualSearchHttpResponse,
): Promise<void> {
  const ttl = byPhotoCacheTtlSeconds(result);
  if (ttl === null) return;
  await cacheSet(resultCacheKey(imageHash), result, ttl);
}
