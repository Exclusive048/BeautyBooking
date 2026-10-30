import { AppError } from "@/lib/api/errors";
import {
  hashOtpKeyPart,
  otpAppReviewFailKey,
  otpRequestIdentityIpKey,
  otpRequestIdentityKey,
  otpRequestIpKey,
  otpVerifyFailKey,
  otpVerifyLockKey,
} from "@/lib/auth/otp-rate-limit-keys";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { alertOtpRateLimitTriggered } from "@/lib/monitoring/api-alerts";

const OTP_REQUEST_IP_LIMIT = 5;
const OTP_REQUEST_IP_WINDOW_SECONDS = 60;

/**
 * SEC-26 — выпуск кода ограничивается в ДВУХ измерениях, и это не дублирование:
 * измерения защищают разное и потому не сводятся одно к другому.
 *
 * Раньше бюджет запросов был один и ключевался ТОЛЬКО идентичностью
 * (`otp:request:phone:<hash>`, 3 / 5 мин). Третье лицо, знающее номер, сжигало
 * его целиком и на пять минут лишало владельца возможности получить код —
 * тот же таргетированный DoS, который на verify-стороне уже закрыт
 * добавлением IP в ключ (SECURITY-EXPOSURE-AUDIT-01 · O2).
 *
 * Просто скопировать то решение сюда НЕЛЬЗЯ: verify ничего не отправляет, а
 * request отправляет SMS/письмо. Ключ `(идентичность, IP)` без глобального
 * потолка означал бы, что распределённый источник шлёт жертве неограниченное
 * число сообщений за наш счёт — это хуже, чем пятиминутная блокировка.
 *
 * Поэтому:
 *   - `(идентичность, IP)` — 3 / 5 мин, **ровно как было**: один источник не
 *     может выбрать чужой бюджет, а нормальный пользователь со своего IP
 *     ничего не замечает;
 *   - `идентичность` — 10 / 60 мин: потолок «сколько сообщений вообще можно
 *     отправить на этот адрес», то есть защита от бомбардировки и от расхода
 *     бюджета шлюза.
 *
 * Атака не исчезает полностью — она дорожает: чтобы лишить владельца кода,
 * нужно не одно обращение, а ≥4 источника. Полностью её убрать нельзя, не сняв
 * потолок отправок, а он защищает жертву от худшего. Заодно почасовой предел
 * ужесточается: раньше распределённый источник мог выдать до 36 сообщений в
 * час на номер, теперь 10.
 */
const OTP_REQUEST_IDENTITY_IP_LIMIT = 3;
const OTP_REQUEST_IDENTITY_IP_WINDOW_SECONDS = 5 * 60;
const OTP_REQUEST_IDENTITY_LIMIT = 10;
const OTP_REQUEST_IDENTITY_WINDOW_SECONDS = 60 * 60;

const OTP_VERIFY_FAIL_LIMIT = 5;
const OTP_VERIFY_LOCK_SECONDS = 15 * 60;
const OTP_VERIFY_RETRY_AFTER_SECONDS = 60;

/**
 * FIX-B14: отказ вынесен в собственный экспортируемый тип — на него опирается
 * `otp-rate-limit-response.ts`, единственное место, где он превращается в
 * HTTP-ответ. До этого каждый из четырёх OTP-роутов собирал конверт руками и
 * клал `error` (машинный код) туда, где клиент ждёт текст.
 */
export type OtpRateLimitRefusal = {
  ok: false;
  status: number;
  error: "RATE_LIMIT" | "RATE_LIMIT_UNAVAILABLE" | "OTP_LOCKED";
  retryAfterSec: number;
};

type RateLimitResult = { ok: true } | OtpRateLimitRefusal;

// FIX-D1: вывод имён ключей живёт в `otp-rate-limit-keys.ts` — там же, откуда
// его берёт QA-харнесс. Вторая копия вывода уже протухала дважды (SMOKE-02 · Ф-2).
const hashKey = hashOtpKeyPart;

/**
 * Scope the verify-failure counter/lock by (identity + client IP), not by the
 * identity (phone/email) alone.
 *
 * SECURITY-EXPOSURE-AUDIT-01 · O2: keying the lock on the victim's phone alone
 * let a third party who knew the number burn the 5-attempt budget and lock that
 * specific person out of logging in — a cheap targeted DoS. With the IP
 * dimension an attacker locks only (victim-identity, attacker-IP); the victim
 * from their own IP is never affected. Single-source brute-force stays bounded
 * to exactly the same 5 attempts / 15 min as before, so brute-force protection
 * is unchanged — only the cross-victim lockout is removed. Distributed
 * brute-force is bounded instead by 6-digit code entropy × single-use × 5-min
 * TTL × the request-side limits (3 codes / 5 min / phone), which is infeasible.
 *
 * ⚠️ Correctness depends on client-IP resolution. If TRUSTED_PROXY_HOPS is
 * misconfigured in prod so every request resolves to the same edge IP, this
 * degrades to per-identity — i.e. today's behaviour — never worse, and correct
 * once the proxy hops are set. Flagged in the deploy checklist.
 */

/**
 * RES-11 — каждая команда Redis здесь идёт через `withRedisCommandTimeout`.
 *
 * Модуль уже был написан fail-closed: любой отказ Redis ловится и превращается
 * в 503 `RATE_LIMIT_UNAVAILABLE` / 429 — но ловится только то, что ОТКЛОНИЛОСЬ.
 * Во время brownout'а (реконнект `redis@5`) команда не отклоняется вовсе:
 * `socket.isOpen` остаётся `true`, промис не settl'ится, команда уходит в
 * offline-очередь — и `catch` не выполняется никогда. То есть выпуск OTP висел
 * бы на первом же дребезге, а fail-closed-ветка, ради которой всё написано,
 * оставалась недостижимой (тот же механизм, что RES-01 закрыл в кэш-слое).
 *
 * Семантика таймаута здесь однозначна и совпадает с уже написанной обработкой:
 * не смогли посчитать лимит — значит отказ, а не «пропустим». Это чувствительный
 * путь (CLAUDE.md rule 10).
 */
async function incrWithWindow(
  key: string,
  windowSeconds: number
): Promise<number> {
  const client = await getRedisConnection();
  if (!client) throw new Error("Redis unavailable");

  const count = await withRedisCommandTimeout("otp:incr", client.incr(key));
  if (count === 1) {
    await withRedisCommandTimeout("otp:expire", client.expire(key, windowSeconds));
  } else {
    // RATE-LIMIT-TTL-HEAL (29.09 доработки): срок окна ставится на первом
    // инкременте, и если та команда не дошла (таймаут при brownout Redis,
    // падение процесса между INCR и EXPIRE), ключ остаётся БЕЗ срока — лимит
    // для этого адреса и маршрута не сбрасывается никогда. Замер на dev:
    // `rl:publicApi:::1:GET:/api/media` — TTL −1, счётчик 152, 429 навсегда.
    // На превышении срок досылается с `NX` (только если его нет): такой ключ
    // живёт не дольше одного окна, а исправный окно не продлевает.
    // Здесь — на каждом следующем инкременте: предел у вызывающих разный, а
    // ключ без срока держал бы и бюджет выпуска кода, и потолок в час.
    await withRedisCommandTimeout("otp:expire-heal", client.expire(key, windowSeconds, "NX"));
  }
  return count;
}

async function ttlSeconds(key: string): Promise<number> {
  const client = await getRedisConnection();
  if (!client) throw new Error("Redis unavailable");
  const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(key));
  if (ttl > 0) return ttl;
  return 0;
}

export async function checkOtpRequestRateLimit(input: {
  phone: string;
  ip: string | null;
}): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    return { ok: false, status: 503, error: "RATE_LIMIT_UNAVAILABLE", retryAfterSec: 60 };
  }

  const ipKey = otpRequestIpKey(input.ip);
  // SEC-26: бюджет одного источника. Прежний ключ `otp:request:phone:<hash>`
  // ключевался только идентичностью, поэтому чужой запрос списывал бюджет
  // владельца.
  const identityIpKey = otpRequestIdentityIpKey("phone", input.phone, input.ip);
  // Потолок отправок на идентичность — защита от бомбардировки и расхода шлюза.
  const identityKey = otpRequestIdentityKey("phone", input.phone);

  let ipCount = 0;
  let identityIpCount = 0;
  let identityCount = 0;

  try {
    [ipCount, identityIpCount, identityCount] = await Promise.all([
      incrWithWindow(ipKey, OTP_REQUEST_IP_WINDOW_SECONDS),
      incrWithWindow(identityIpKey, OTP_REQUEST_IDENTITY_IP_WINDOW_SECONDS),
      incrWithWindow(identityKey, OTP_REQUEST_IDENTITY_WINDOW_SECONDS),
    ]);
  } catch (error) {
    logError("OTP request rate limit failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 503, error: "RATE_LIMIT_UNAVAILABLE", retryAfterSec: 60 };
  }

  const ipExceeded = ipCount > OTP_REQUEST_IP_LIMIT;
  const identityIpExceeded = identityIpCount > OTP_REQUEST_IDENTITY_IP_LIMIT;
  const identityExceeded = identityCount > OTP_REQUEST_IDENTITY_LIMIT;

  if (ipExceeded || identityIpExceeded || identityExceeded) {
    alertOtpRateLimitTriggered(input.ip, input.phone);
    const retryAfter = Math.max(
      ipExceeded ? await ttlSeconds(ipKey) : 0,
      identityIpExceeded ? await ttlSeconds(identityIpKey) : 0,
      identityExceeded ? await ttlSeconds(identityKey) : 0,
      1
    );
    return { ok: false, status: 429, error: "RATE_LIMIT", retryAfterSec: retryAfter };
  }

  return { ok: true };
}

export async function checkOtpVerifyLock(phone: string, ip: string | null): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const lockKey = otpVerifyLockKey("phone", phone, ip);
    const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
    if (ttl > 0) {
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl };
    }
  } catch (error) {
    logError("OTP verify lock check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function registerOtpVerifyFailure(phone: string, ip: string | null): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const key = otpVerifyFailKey("phone", phone, ip);
    const count = await withRedisCommandTimeout("otp:incr", client.incr(key));
    if (count === 1) {
      await withRedisCommandTimeout("otp:expire", client.expire(key, OTP_VERIFY_LOCK_SECONDS));
    } else {
      // RATE-LIMIT-TTL-HEAL: счётчик неудач без срока не сбрасывался бы никогда.
      await withRedisCommandTimeout("otp:expire-heal", client.expire(key, OTP_VERIFY_LOCK_SECONDS, "NX"));
    }
    if (count >= OTP_VERIFY_FAIL_LIMIT) {
      alertOtpRateLimitTriggered(ip, phone);
      const lockKey = otpVerifyLockKey("phone", phone, ip);
      await withRedisCommandTimeout("otp:set", client.set(lockKey, "1", { EX: OTP_VERIFY_LOCK_SECONDS }));
      const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl > 0 ? ttl : OTP_VERIFY_LOCK_SECONDS };
    }
  } catch (error) {
    logError("OTP verify failure count failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function clearOtpVerifyFailures(phone: string, ip: string | null): Promise<void> {
  const client = await getRedisConnection();
  if (!client) return;

  try {
    const failKey = otpVerifyFailKey("phone", phone, ip);
    const lockKey = otpVerifyLockKey("phone", phone, ip);
    await Promise.all([
      withRedisCommandTimeout("otp:del", client.del(failKey)),
      withRedisCommandTimeout("otp:del", client.del(lockKey)),
    ]);
  } catch (error) {
    logError("OTP verify lock cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Email OTP rate limit ──────────────────────────────────────────────────────

// SEC-26: близнец телефонных лимитов. Дефект был тот же — бюджет выпуска
// ключевался только адресом, — а канал этот в закрытом деплое ЕДИНСТВЕННЫЙ
// рабочий (`PHONE_AUTH_ENABLED` в проде off), так что чинить его отдельно от
// телефонного значило бы закрыть спящую дверь и оставить живую.
const OTP_REQUEST_EMAIL_IP_LIMIT = 3;
const OTP_REQUEST_EMAIL_IP_WINDOW_SECONDS = 5 * 60;
const OTP_REQUEST_EMAIL_LIMIT = 10;
const OTP_REQUEST_EMAIL_WINDOW_SECONDS = 60 * 60;

export async function checkOtpEmailRequestRateLimit(input: {
  email: string;
  ip: string | null;
}): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    return { ok: false, status: 503, error: "RATE_LIMIT_UNAVAILABLE", retryAfterSec: 60 };
  }

  const normalizedEmail = input.email.toLowerCase();
  const ipKey = otpRequestIpKey(input.ip);
  // SEC-26: бюджет одного источника (см. телефонный близнец выше).
  const emailIpKey = otpRequestIdentityIpKey("email", normalizedEmail, input.ip);
  // Потолок отправок на адрес — защита от бомбардировки почтового ящика.
  const emailKey = otpRequestIdentityKey("email", normalizedEmail);

  let ipCount = 0;
  let emailIpCount = 0;
  let emailCount = 0;

  try {
    [ipCount, emailIpCount, emailCount] = await Promise.all([
      incrWithWindow(ipKey, OTP_REQUEST_IP_WINDOW_SECONDS),
      incrWithWindow(emailIpKey, OTP_REQUEST_EMAIL_IP_WINDOW_SECONDS),
      incrWithWindow(emailKey, OTP_REQUEST_EMAIL_WINDOW_SECONDS),
    ]);
  } catch (error) {
    logError("OTP email request rate limit failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 503, error: "RATE_LIMIT_UNAVAILABLE", retryAfterSec: 60 };
  }

  const ipExceeded = ipCount > OTP_REQUEST_IP_LIMIT;
  const emailIpExceeded = emailIpCount > OTP_REQUEST_EMAIL_IP_LIMIT;
  const emailExceeded = emailCount > OTP_REQUEST_EMAIL_LIMIT;

  if (ipExceeded || emailIpExceeded || emailExceeded) {
    alertOtpRateLimitTriggered(input.ip, input.email);
    const retryAfter = Math.max(
      ipExceeded ? await ttlSeconds(ipKey) : 0,
      emailIpExceeded ? await ttlSeconds(emailIpKey) : 0,
      emailExceeded ? await ttlSeconds(emailKey) : 0,
      1
    );
    return { ok: false, status: 429, error: "RATE_LIMIT", retryAfterSec: retryAfter };
  }

  return { ok: true };
}

export async function checkOtpEmailVerifyLock(email: string, ip: string | null): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const lockKey = otpVerifyLockKey("email", email, ip);
    const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
    if (ttl > 0) {
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl };
    }
  } catch (error) {
    logError("OTP email verify lock check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function registerOtpEmailVerifyFailure(email: string, ip: string | null): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const key = otpVerifyFailKey("email", email, ip);
    const count = await withRedisCommandTimeout("otp:incr", client.incr(key));
    if (count === 1) {
      await withRedisCommandTimeout("otp:expire", client.expire(key, OTP_VERIFY_LOCK_SECONDS));
    } else {
      // RATE-LIMIT-TTL-HEAL: счётчик неудач без срока не сбрасывался бы никогда.
      await withRedisCommandTimeout("otp:expire-heal", client.expire(key, OTP_VERIFY_LOCK_SECONDS, "NX"));
    }
    if (count >= OTP_VERIFY_FAIL_LIMIT) {
      alertOtpRateLimitTriggered(ip, email);
      const lockKey = otpVerifyLockKey("email", email, ip);
      await withRedisCommandTimeout("otp:set", client.set(lockKey, "1", { EX: OTP_VERIFY_LOCK_SECONDS }));
      const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl > 0 ? ttl : OTP_VERIFY_LOCK_SECONDS };
    }
  } catch (error) {
    logError("OTP email verify failure count failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Слишком часто. Подождите минуту и попробуйте ещё раз.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function clearOtpEmailVerifyFailures(email: string, ip: string | null): Promise<void> {
  const client = await getRedisConnection();
  if (!client) return;

  try {
    const failKey = otpVerifyFailKey("email", email, ip);
    const lockKey = otpVerifyLockKey("email", email, ip);
    await Promise.all([
      withRedisCommandTimeout("otp:del", client.del(failKey)),
      withRedisCommandTimeout("otp:del", client.del(lockKey)),
    ]);
  } catch (error) {
    logError("OTP email verify lock cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── App Review: потолок неверных кодов с любого IP ────────────────────────────

/**
 * APP-REVIEW-LOGIN-CAP — второй счётчик для адреса App Review, по адресу и с
 * ЛЮБОГО IP.
 *
 * Обоснование ключа (почта, IP) выше (O2) держится на трёх свойствах обычного
 * кода: он одноразовый, живёт 5 минут, а его выпуск ограничен. У постоянного
 * кода App Review (`APP_REVIEW_LOGIN_CODE`, 6 цифр) нет ни одного: он не
 * истекает, не сгорает при входе и не выпускается — запрос его не создаёт.
 * Блокировка (почта, IP) оставляет распределённому перебору по 5 попыток на
 * каждый IP за 15 минут, и из 10^6 вариантов ботнет или аренда IPv6-подсети
 * находит код за часы–дни (C-03).
 *
 * Поэтому у этого адреса есть потолок: 20 неверных кодов за окно 24 ч от первой
 * неудачи. На двадцатой режим App Review закрывается: код не принимается, даже
 * верный, до конца окна. Перебор дорожает до ~25 000 суток на половину
 * вариантов. Блокировка (почта, IP) продолжает работать как раньше.
 *
 * Снимается сам, по окну, а не вручную: ревьюер, попавший под чужой перебор,
 * ждёт не дольше суток, а не того дня, когда кто-то вспомнит про ключ в Redis.
 * Открыть раньше — сменить `APP_REVIEW_LOGIN_EMAIL` (счётчик ключуется адресом)
 * либо удалить ключ `otpAppReviewFailKey`.
 *
 * 🔴 Осознанный размен: третье лицо, знающее служебный адрес, может двадцатью
 * неверными кодами в сутки держать вход ревьюера закрытым — в том числе на
 * время ревью. Это дешевле, чем отдать аккаунт ревьюера перебору. Закрытие
 * видно сразу (Telegram-алерт со своим ключом), реакция — сменить адрес и код.
 *
 * Отказ неотличим от неверного кода: закрытый режим код не сравнивает вовсе,
 * поэтому нет и разницы по времени, а ответ идёт той же веткой — счётчик
 * (почта, IP) и 401 `CODE_NOT_FOUND` (`verifyEmailOtpLogin`). Redis недоступен
 * — режим закрыт: не смогли посчитать — не пускаем, как весь модуль.
 *
 * Гонка: проверка и инкремент — разные команды, поэтому запросы, уже бывшие в
 * полёте в момент двадцатой неудачи, сравнят код ещё раз. Добор ограничен
 * числом одновременных запросов и блокировкой (почта, IP).
 */
const APP_REVIEW_FAIL_LIMIT = 20;
const APP_REVIEW_FAIL_WINDOW_SECONDS = 24 * 60 * 60;
const APP_REVIEW_LOCKED_ALERT_KEY = "auth:app-review-login:locked";
const APP_REVIEW_LOCKED_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Принимает ли сейчас режим App Review код. Любой сбой Redis — нет. */
export async function isAppReviewLoginOpen(email: string): Promise<boolean> {
  const client = await getRedisConnection();
  if (!client) return false;

  try {
    const raw = await withRedisCommandTimeout("otp:get", client.get(otpAppReviewFailKey(email)));
    const failures = raw === null ? 0 : Number(raw);
    // Нечитаемое значение — тоже «закрыто»: доказать, что потолок не выбран, нечем.
    return Number.isFinite(failures) && failures < APP_REVIEW_FAIL_LIMIT;
  } catch (error) {
    logError("App Review login gate check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Неверный код для адреса App Review (в том числе при закрытом режиме).
 * Сбой записи не роняет ответ: следом идёт счётчик (почта, IP), который при
 * недоступном Redis сам отказывает, а проверка выше закрыта при любом сбое.
 */
export async function registerAppReviewLoginFailure(email: string): Promise<void> {
  const client = await getRedisConnection();
  if (!client) return;

  try {
    const failures = await incrWithWindow(otpAppReviewFailKey(email), APP_REVIEW_FAIL_WINDOW_SECONDS);
    // Ровно на пороге: дальнейшие неудачи окна алерт не повторяют, а новое окно
    // с новым перебором повторит. В тексте нет ни адреса, ни кода, ни IP.
    if (failures === APP_REVIEW_FAIL_LIMIT) {
      logInfo("auth.app-review-login.locked", { failures, windowHours: APP_REVIEW_FAIL_WINDOW_SECONDS / 3600 });
      void sendTelegramAlert(
        `Вход App Review закрыт: ${failures} неверных кодов за сутки с любых адресов. ` +
          "Код не принимается до конца суточного окна. Если это не проверяющий магазина, " +
          "код подбирают: смените APP_REVIEW_LOGIN_CODE и APP_REVIEW_LOGIN_EMAIL.",
        APP_REVIEW_LOCKED_ALERT_KEY,
        APP_REVIEW_LOCKED_ALERT_COOLDOWN_MS,
      );
    }
  } catch (error) {
    logError("App Review login failure count failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
