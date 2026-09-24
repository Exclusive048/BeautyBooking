import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";
import { isProduction } from "@/lib/env";

export type RateLimitConfig = {
  windowSeconds: number;
  maxRequests: number;
};

/**
 * FIX-B12 — почему у отказа есть ПРИЧИНА, а не только флаг.
 *
 * `limited: true` возвращается в двух совершенно разных случаях: бюджет
 * действительно исчерпан, либо посчитать бюджет не удалось и чувствительный
 * роут закрывается (инв. #6). Прокси рендерил оба одинаково — 429 «Too many
 * requests», — то есть при обрыве Redis продукт отвечал пользователю, сделавшему
 * ОДИН запрос, что запросов слишком много. Это не косметика: 429 учит клиента
 * «подожди и повтори реже», а верный сигнал здесь — 503 «сервис временно
 * недоступен», тот же, что уже отдаёт `otp-rate-limit.ts` (RES-11).
 *
 * Поле опционально, поэтому существующие потребители, читающие только
 * `.limited`, не меняются.
 */
export type RateLimitLimitReason = "budget" | "unavailable";

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number; reason?: RateLimitLimitReason };

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();
const MEMORY_FALLBACK_MAX_BUCKETS = 20_000;
const SENSITIVE_ROUTE_PREFIXES = [
  "/api/auth",
  "/api/billing",
  "/api/bookings",
  "/api/payments",
  "/api/me/delete",
  "/api/cabinet/master/delete",
  "/api/cabinet/studio/delete",
  "/api/categories/propose",
  "/api/master/portfolio",
  "/api/studio",
  "/api/studios",
  "/api/reviews",

  /**
   * FIX-B12 — четыре класса из триажа FIX-B11, решение владельца.
   *
   * Префиксы состоят ТОЛЬКО из литеральных сегментов — это требование
   * `route-template.ts`: динамические сегменты схлопываются в `:id`, поэтому
   * префикс с `[id]`/`:id` внутри перестал бы совпадать. Следствие — префикс
   * покрывает ПОДДЕРЕВО, то есть чуть шире названных роутов; состав покрытого
   * (43 роута на 2026-08-12) выводится из дерева `src/app/api` и проверяется
   * тестом `fail-closed-classes.test.ts` — там же поведенческая половина.
   * Ни один публичный browsing-путь (каталог, профили, слоты) в них не попал:
   * обрыв Redis не гасит анонимный сайт.
   */

  // (б) booking-write вне `/api/bookings` — та же асимметрия внутри домена,
  // которую LOGIC-14 нашёл в биллинге: `/api/bookings` fail-closed, а
  // мастерский и админский пути записи брони проваливались в memory-fallback.
  "/api/master/bookings",
  "/api/model-applications",
  "/api/admin/hot-slots",
  // Отметка дня выходным отменяет брони в той же транзакции (LOGIC-13), то есть
  // это booking-write, а не «настройки».
  "/api/cabinet/master/schedule",

  // (в) ПДн — правило 10. Массовые ЧТЕНИЯ тоже покрыты намеренно: именно они
  // вектор перечисления, ради которого заведён `PdAccessLog` (RKN-FIX-10),
  // поэтому метод здесь не различается (как и у всех префиксов выше).
  "/api/me",
  "/api/cabinet/user/profile",
  "/api/master/clients",
  "/api/chat/threads",
  "/api/integrations/vk",

  // (г) создание аккаунта / подписки — mass-trial-вектор, ради которого класс и
  // существует: эти шесть роутов создают `UserProfile` + `UserSubscription`.
  "/api/onboarding",
  "/api/profiles",
  "/api/invites",

  // (а) админские денежные мутации. Возражение про доступность здесь почти
  // пустое: администратор фактически один человек, и он же перезапускает Redis,
  // тогда как неограниченные денежные мутации под скомпрометированными
  // кредами стоят несопоставимо больше короткого локаута. Break-glass
  // намеренно НЕ заводится — пересмотр, когда появится второй администратор.
  "/api/admin/billing",
  "/api/admin/users",
] as const;

/**
 * LOGIC-14: изъятия из fail-closed, каждое — с причиной.
 *
 * `/api/billing` целиком чувствителен: checkout / cancel / auto-renew —
 * мутирующие денежные действия, и до этого весь домен проваливался в
 * `publicApi`, тогда как вебхук (`/api/payments`) fail-closed уже был.
 * Но два прогона по расписанию лежат под тем же префиксом, и для НИХ
 * fail-closed значит противоположное задуманному:
 *
 *  · `/api/billing/renew/run` — LOGIC-07 осознанно сделал его лок **fail-open**
 *    именно потому, что от двойного списания защищает `BillingPayment.
 *    idempotenceKey` (инв. #4), а не Redis; остановить биллинг на сутки из-за
 *    недоступного Redis — цена без выигрыша. 429 на входе отменил бы это
 *    решение, не изменив его текста.
 *  · `/api/billing/mrr/snapshot/run` — снапшот строго за сегодня и за
 *    пропущенный день не бэкфиллится, то есть 429 стирает точку данных
 *    навсегда.
 *
 * Оба — не браузерные поверхности: гейт у них токеном в заголовке
 * (`isAuthorizedCronRequest`, SEC-21), а не рейт-лимитом.
 */
const SENSITIVE_ROUTE_EXCEPTIONS = [
  "/api/billing/renew/run",
  "/api/billing/mrr/snapshot/run",
] as const;

const SENSITIVE_KEY_PREFIXES = [
  "rate:createBooking:",
  // SECURITY-EXPOSURE-AUDIT-01 · Y6: the public booking-write paths must fail
  // CLOSED on a Redis outage like `rate:createBooking:` does, not fail open.
  "rate:publicBooking:",
  "rate:packageBook:",
  "rate:studioPackageBook:",
  // GUEST-MANAGE-LINK: отмена и перенос записи гостем по ссылке — тоже гостевая запись.
  "rate:guestManage:",
  "rl:categories:propose:",
  "rl:/api/me/delete",
  "rl:/api/cabinet/master/delete",
  "rl:/api/cabinet/studio/delete",
  "rl:/api/bookings",
  "rl:/api/master/portfolio",
  "rl:/api/studio",
  "rl:/api/studios",
  "rl:/api/reviews",
  // FIX-B12: единственный из 24 роутов класса, у которого есть СВОЙ лимитер
  // (`rate:chatSend:<userId>`, per-user отправка сообщений). Префикс пути выше
  // делает fail-closed прокси-тир, но собственный ключ — более узкий лимитер
  // того же роута, и оставить его fail-open значило бы держать в одном роуте
  // две разные политики на случай обрыва Redis.
  "rate:chatSend:",

  /**
   * FIX-B15 — политика регистрируется ЗАРАНЕЕ, пока путь недостижим.
   *
   * Запись ниже сегодня инертна: код до неё не доходит, потому что выше по
   * обработчику стоит килсвитч, снимаемый **в деплое**. Именно поэтому её и надо
   * внести сейчас: иначе флип флага делает путь живым И fail-open ОДНИМ
   * движением, а заметить это некому — тесты зелёные, дифф пустой, гейты в
   * деплое не работают. Регистрация здесь разводит два события: флаг меняет
   * достижимость, политика уже верна к моменту, когда она понадобится.
   *
   * `rate:telegramWebhook:<ip>` (`lib/telegram/webhookRateLimit.ts`).
   * `POST /api/telegram/webhook` первой строкой спрашивает `getTelegramEnabled()`,
   * тот короткозамыкает на env-потолке `NEXT_PUBLIC_TELEGRAM_ENABLED` (unset →
   * false, ФЗ-199) — до лимита, проверки секрета и записи `TelegramLinkToken`
   * управление не доходит.
   *
   * Префикс ПУТИ `/api/telegram` намеренно НЕ заводится: под него попали бы
   * `status`/`settings` — чтения кабинетных настроек, для которых обрыв Redis
   * не повод отказывать. ⚠️ Отказ здесь придёт с текстом «слишком много
   * запросов», а не «сервис недоступен»: `checkTelegramWebhookRateLimit` идёт
   * через legacy-перегрузку `checkRateLimit`, которая возвращает `boolean` и
   * причину выразить не может. Для этого сайта это приемлемо — вызывающий
   * телеграм-бот, а не браузер, и у него свои ретраи; исправление означало бы
   * менять legacy-перегрузку, то есть все её сайты сразу.
   *
   * ⚠️ Свип нашёл ВТОРОЙ ключ той же формы и осознанно его НЕ внёс:
   * `rl:visual-search:budget:global:<UTC-дата>` — единственный денежный потолок
   * платного vision-вызова, тоже достижимый лишь за килсвитчем
   * (`VISUAL_SEARCH_ENABLED`). Отличие решающее: у него есть **ратифицированное
   * обратное решение** — заголовок `visual-search/by-photo-guards.ts` (SEC-04,
   * AUDIT-CAMPAIGN-02 п.7) прямо пишет, что деградация наследуется от
   * `checkRateLimit` и «осознанно не ужесточается». Внести префикс значило бы
   * молча отменить его. При этом довод «за» появляется ровно в день флипа:
   * memory-fallback умножает суточный потолок на число процессов и обнуляет его
   * рестартом, то есть у платного вызова перестаёт быть верхняя граница.
   * Поэтому это пункт pre-flip-чеклиста в `DEPLOY-BACKLOG.md`, а не правка тут.
   */
  "rate:telegramWebhook:",
] as const;
const RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS = 60;

function nowMs() {
  return Date.now();
}

function extractApiPathFromKey(key: string): string | null {
  const index = key.indexOf("/api/");
  if (index === -1) return null;
  return key.slice(index);
}

export function isSensitiveRouteKey(key: string): boolean {
  if (SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return true;
  }
  const path = extractApiPathFromKey(key);
  if (!path) return false;
  if (SENSITIVE_ROUTE_EXCEPTIONS.some((exception) => path === exception)) {
    return false;
  }
  return SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function checkMemoryLimit(key: string, limit: number, windowSeconds: number): boolean {
  const result = checkMemoryLimitDetailed(key, limit, windowSeconds);
  return result.allowed;
}

function pruneMemoryBuckets(now: number): void {
  if (memoryBuckets.size < MEMORY_FALLBACK_MAX_BUCKETS) return;

  for (const [bucketKey, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) {
      memoryBuckets.delete(bucketKey);
    }
  }

  if (memoryBuckets.size < MEMORY_FALLBACK_MAX_BUCKETS) return;

  const overflow = memoryBuckets.size - MEMORY_FALLBACK_MAX_BUCKETS + 1;
  let removed = 0;
  for (const bucketKey of memoryBuckets.keys()) {
    memoryBuckets.delete(bucketKey);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function checkMemoryLimitDetailed(
  key: string,
  limit: number,
  windowSeconds: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = nowMs();
  const windowMs = windowSeconds * 1000;
  pruneMemoryBuckets(now);

  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: windowSeconds };
  }
  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: windowSeconds };
}

function maybeAlertRedisRateLimitDegraded(): void {
  const count = trackError("redis:rate-limit");
  if (count === 3) {
    void sendTelegramAlert(
      "\u26A0\uFE0F Redis \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 rate limit \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0432 degraded-\u0440\u0435\u0436\u0438\u043C\u0435 (3 \u043E\u0448\u0438\u0431\u043A\u0438 \u0437\u0430 \u043C\u0438\u043D\u0443\u0442\u0443)",
      "redis:rate-limit:unavailable"
    );
  }
}

function buildMemoryFallbackResult(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const fallback = checkMemoryLimitDetailed(
    key,
    config.maxRequests,
    config.windowSeconds
  );
  if (fallback.allowed) {
    return { limited: false };
  }
  return { limited: true, retryAfterSeconds: fallback.retryAfterSeconds };
}

async function checkRateLimitConfig(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const client = await getRedisConnection();
    if (!client) {
      if (isSensitiveRouteKey(key)) {
        return {
          limited: true,
          retryAfterSeconds: RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS,
          reason: "unavailable",
        };
      }
      if (isProduction) {
        logError("Rate limit Redis unavailable, using bounded memory fallback", {
          key,
          mode: "config",
          __skipAlert: true,
        });
        maybeAlertRedisRateLimitDegraded();
        return buildMemoryFallbackResult(key, config);
      }
      logError("Rate limit Redis unavailable, fail-open", {
        key,
        mode: "config",
        __skipAlert: true,
      });
      maybeAlertRedisRateLimitDegraded();
      return { limited: false };
    }

    const count = await withRedisCommandTimeout(
      "rate-limit:config:incr",
      client.incr(key)
    );
    if (count === 1) {
      await withRedisCommandTimeout(
        "rate-limit:config:expire",
        client.expire(key, config.windowSeconds)
      );
    }

    if (count > config.maxRequests) {
      return { limited: true, retryAfterSeconds: config.windowSeconds };
    }

    return { limited: false };
  } catch (error) {
    logError("Rate limit check failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    if (isSensitiveRouteKey(key)) {
      return {
        limited: true,
        retryAfterSeconds: RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS,
        reason: "unavailable",
      };
    }
    maybeAlertRedisRateLimitDegraded();
    if (isProduction) {
      return buildMemoryFallbackResult(key, config);
    }
    return { limited: false };
  }
}

async function checkRateLimitLegacy(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const client = await getRedisConnection();
    if (!client) {
      if (isSensitiveRouteKey(key)) {
        return false;
      }
      logError("Rate limit Redis unavailable, using memory fallback", {
        key,
        mode: "legacy",
        __skipAlert: true,
      });
      maybeAlertRedisRateLimitDegraded();
      return checkMemoryLimit(key, limit, windowSeconds);
    }

    const count = await withRedisCommandTimeout(
      "rate-limit:legacy:incr",
      client.incr(key)
    );
    if (count === 1) {
      await withRedisCommandTimeout(
        "rate-limit:legacy:expire",
        client.expire(key, windowSeconds)
      );
    }
    return count <= limit;
  } catch (error) {
    logError("Rate limit check failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    if (isSensitiveRouteKey(key)) {
      return false;
    }
    maybeAlertRedisRateLimitDegraded();
    if (isProduction) {
      return checkMemoryLimit(key, limit, windowSeconds);
    }
    return true;
  }
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult>;
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean>;
export async function checkRateLimit(
  key: string,
  configOrLimit: RateLimitConfig | number,
  windowSeconds?: number
): Promise<RateLimitResult | boolean> {
  if (typeof configOrLimit === "number") {
    return checkRateLimitLegacy(key, configOrLimit, windowSeconds ?? 0);
  }
  return checkRateLimitConfig(key, configOrLimit);
}
