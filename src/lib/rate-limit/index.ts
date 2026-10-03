import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";
import { isProduction } from "@/lib/env";
import type { RateLimitKey } from "@/lib/rate-limit/keys";

export type { RateLimitKey } from "@/lib/rate-limit/keys";

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

/**
 * 29.09 доработки · 15 (RATE-LIMIT-MECHANISM-CONSOLIDATION) — fail-closed
 * решает ОДИН признак: шаблон пути в ключе (`lib/rate-limit/keys.ts` кладёт его
 * последним в любой ключ). Прежние три механизма: (1) префикс пути —
 * остался, это он; (2) префикс КЛЮЧА `SENSITIVE_KEY_PREFIXES` — удалён,
 * пространства сведены к шаблонам по таблице ниже; (3) OTP-модуль
 * (`auth/otp-rate-limit.ts`) — остаётся со своими командами, согласие политик
 * держит `sensitive-routes.test.ts` (роуты, импортирующие модуль, обязаны быть
 * чувствительными по пути).
 *
 *   прежнее пространство ключа   → шаблон роута                                   → чем покрыт
 *   rate:createBooking:          → /api/bookings, /api/public/bookings             → префикс; точный шаблон
 *   rate:publicBooking:          → /api/public/bookings                            → точный шаблон
 *   rate:packageBook:            → /api/public/packages/:id/book                   → точный шаблон
 *   rate:studioPackageBook:      → /api/public/packages/:id/studio/book            → точный шаблон
 *   rate:guestManage:            → /api/public/bookings/manage/:id/{cancel,reschedule,review} → точные шаблоны
 *   rate:chatSend:               → /api/chat/threads/:id/messages                  → префикс /api/chat/threads
 *   rate:telegramWebhook:        → /api/telegram/webhook                           → точный шаблон
 *   rl:categories:propose:       → /api/categories/propose                         → префикс
 *   rl:/api/me/delete…           → /api/me/delete                                  → префикс /api/me/delete
 *   rl:/api/cabinet/{master,studio}/delete… → те же пути                          → префиксы
 *   rl:/api/bookings…            → /api/bookings/…                                 → префикс
 *   rl:/api/master/portfolio…    → /api/master/portfolio/…                         → префикс
 *   rl:/api/studio… / rl:/api/studios… → /api/studio/…, /api/studios/…             → префиксы
 *   rl:/api/reviews…             → /api/reviews/…                                  → префикс
 *
 * Сверку держит `sensitive-routes.test.ts`: ключ каждого прежнего пространства
 * добывается из настоящего лимитера роута и обязан остаться чувствительным.
 */
const SENSITIVE_ROUTE_PREFIXES = [
  "/api/auth",
  // MOBILE-AUTH-A: входы приложения — тот же класс, что `/api/auth` (выдача и
  // ротация сессий). Конфиг `/api/mobile/v1/config` сюда НЕ входит: это
  // справочник, обрыв Redis не должен гасить запуск приложения.
  "/api/mobile/v1/auth",
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

/**
 * Точные шаблоны: пишущие пути, чей префикс нельзя сделать чувствительным
 * целиком. Под `/api/public/bookings` лежит `GET /api/public/bookings/[id]`
 * (экран «запись создана» после перезагрузки) — префикс сделал бы его
 * fail-closed; оба `propose` пакетов ничего не пишут и остаются fail-open
 * (другие шаблоны). Гостевые пишущие входы закрыты с SECURITY-EXPOSURE-AUDIT-01
 * · Y6 (прежде — префиксом ключа, замер FIX-C10).
 *
 * `/api/telegram/webhook` — политика зарегистрирована ЗАРАНЕЕ (FIX-B15): сегодня
 * путь недостижим, пока Telegram выключен пустым
 * `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (ENV-SPLIT-01), и именно поэтому она
 * записана здесь — иначе включение сделало бы путь живым И fail-open одним
 * движением. Префикс `/api/telegram` не заводится: под ним `status`/`settings`
 * — чтения кабинетных настроек.
 *
 * Следствие, принятое явно: шаблон один на ключ роута и ключ прокси, поэтому
 * для этих путей fail-closed стал и тир прокси — отказ при обрыве приходит на
 * хоп раньше, тем же 503 `RATE_LIMIT_UNAVAILABLE` (FIX-B12).
 */
const SENSITIVE_ROUTE_TEMPLATES = [
  "/api/public/bookings",
  "/api/public/bookings/manage/:id/cancel",
  "/api/public/bookings/manage/:id/reschedule",
  // 29.09 доработки · 05: отзыв гостя по той же ссылке — гостевая запись.
  "/api/public/bookings/manage/:id/review",
  "/api/public/packages/:id/book",
  "/api/public/packages/:id/studio/book",
  "/api/telegram/webhook",
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

/** Чувствителен ли шаблон пути (fail-closed при обрыве Redis, инв. #6). */
export function isSensitiveRouteTemplate(template: string): boolean {
  if (SENSITIVE_ROUTE_EXCEPTIONS.some((exception) => template === exception)) {
    return false;
  }
  if (SENSITIVE_ROUTE_TEMPLATES.some((exact) => template === exact)) {
    return true;
  }
  return SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => template === prefix || template.startsWith(`${prefix}/`)
  );
}

/**
 * Чувствителен ли ключ — по шаблону пути, который оба конструктора ключа
 * (`lib/rate-limit/keys.ts`) кладут последним. Ключ без шаблона — не
 * чувствителен (таких конструкторы не строят).
 */
export function isSensitiveRouteKey(key: string): boolean {
  const path = extractApiPathFromKey(key);
  if (!path) return false;
  return isSensitiveRouteTemplate(path);
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
      // RATE-LIMIT-TTL-HEAL (29.09 доработки): срок окна ставится на первом
      // инкременте, и если та команда не дошла (таймаут при brownout Redis,
      // падение процесса между INCR и EXPIRE), ключ остаётся БЕЗ срока — лимит
      // для этого адреса и маршрута не сбрасывается никогда. Замер на dev:
      // `rl:publicApi:::1:GET:/api/media` — TTL −1, счётчик 152, 429 навсегда.
      // На превышении срок досылается с `NX` (только если его нет): такой ключ
      // живёт не дольше одного окна, а исправный окно не продлевает.
      await withRedisCommandTimeout(
        "rate-limit:config:expire-heal",
        client.expire(key, config.windowSeconds, "NX")
      );
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

/**
 * Единственная форма (29.09 доработки · 15): ключ — только из конструкторов
 * `lib/rate-limit/keys.ts` (сырая строка не компилируется), ответ — с причиной
 * отказа. Legacy-перегрузка `(key, limit, windowSeconds) → boolean` удалена: её
 * шесть вызовов при обрыве Redis отвечали «слишком много запросов», причину
 * она выразить не могла.
 */
export async function checkRateLimit(
  key: RateLimitKey,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  return checkRateLimitConfig(key, config);
}

/**
 * MOBILE-CLIENT-01 (B7) — вернуть ОДНУ попытку, израсходованную
 * `checkRateLimit` по этому ключу, когда операция за ней не состоялась по вине
 * сервера (5xx). Нужен там, где бюджет — единицы в час: упавшее удаление
 * аккаунта (`destructiveDelete`, 1/ч) иначе запирало повтор на час.
 *
 * Best-effort и никогда не бросает: не удалось вернуть — попытка просто
 * остаётся израсходованной (как было до функции). Счётчик не уходит ниже нуля:
 * ключ, истёкший между проверкой и возвратом, DECR воскресил бы без срока со
 * значением −1 — такой ключ удаляется. Зовётся только после пройденной
 * `checkRateLimit` того же ключа и только один раз на неё.
 */
export async function refundRateLimit(key: RateLimitKey): Promise<void> {
  try {
    const client = await getRedisConnection();
    if (!client) {
      const bucket = memoryBuckets.get(key);
      if (bucket && bucket.count > 0) bucket.count -= 1;
      return;
    }
    const remaining = await withRedisCommandTimeout("rate-limit:refund:decr", client.decr(key));
    if (remaining <= 0) {
      await withRedisCommandTimeout("rate-limit:refund:del", client.del(key));
    }
  } catch (error) {
    logError("Rate limit refund failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
