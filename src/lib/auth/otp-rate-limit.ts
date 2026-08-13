import crypto from "crypto";
import { AppError } from "@/lib/api/errors";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
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

function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

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
function verifyScopeId(identity: string, ip: string | null): string {
  return `${hashKey(identity)}:${hashKey(ip?.trim() || "unknown")}`;
}

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

  const ipKey = `otp:request:ip:${hashKey(input.ip?.trim() || "unknown")}`;
  // SEC-26: бюджет одного источника. Прежний ключ `otp:request:phone:<hash>`
  // ключевался только идентичностью, поэтому чужой запрос списывал бюджет
  // владельца.
  const identityIpKey = `otp:request:phone-ip:${verifyScopeId(input.phone, input.ip)}`;
  // Потолок отправок на идентичность — защита от бомбардировки и расхода шлюза.
  const identityKey = `otp:request:phone:${hashKey(input.phone)}`;

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
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const lockKey = `otp:verify:lock:${verifyScopeId(phone, ip)}`;
    const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
    if (ttl > 0) {
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl };
    }
  } catch (error) {
    logError("OTP verify lock check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function registerOtpVerifyFailure(phone: string, ip: string | null): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const scope = verifyScopeId(phone, ip);
    const key = `otp:verify:fail:${scope}`;
    const count = await withRedisCommandTimeout("otp:incr", client.incr(key));
    if (count === 1) {
      await withRedisCommandTimeout("otp:expire", client.expire(key, OTP_VERIFY_LOCK_SECONDS));
    }
    if (count >= OTP_VERIFY_FAIL_LIMIT) {
      alertOtpRateLimitTriggered(ip, phone);
      const lockKey = `otp:verify:lock:${scope}`;
      await withRedisCommandTimeout("otp:set", client.set(lockKey, "1", { EX: OTP_VERIFY_LOCK_SECONDS }));
      const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl > 0 ? ttl : OTP_VERIFY_LOCK_SECONDS };
    }
  } catch (error) {
    logError("OTP verify failure count failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function clearOtpVerifyFailures(phone: string, ip: string | null): Promise<void> {
  const client = await getRedisConnection();
  if (!client) return;

  try {
    const scope = verifyScopeId(phone, ip);
    const failKey = `otp:verify:fail:${scope}`;
    const lockKey = `otp:verify:lock:${scope}`;
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
  const ipKey = `otp:request:ip:${hashKey(input.ip?.trim() || "unknown")}`;
  // SEC-26: бюджет одного источника (см. телефонный близнец выше).
  const emailIpKey = `otp:request:email-ip:${verifyScopeId(normalizedEmail, input.ip)}`;
  // Потолок отправок на адрес — защита от бомбардировки почтового ящика.
  const emailKey = `otp:request:email:${hashKey(normalizedEmail)}`;

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
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const lockKey = `otp:verify:email:lock:${verifyScopeId(email.toLowerCase(), ip)}`;
    const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
    if (ttl > 0) {
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl };
    }
  } catch (error) {
    logError("OTP email verify lock check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function registerOtpEmailVerifyFailure(email: string, ip: string | null): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const scope = verifyScopeId(email.toLowerCase(), ip);
    const key = `otp:verify:email:fail:${scope}`;
    const count = await withRedisCommandTimeout("otp:incr", client.incr(key));
    if (count === 1) {
      await withRedisCommandTimeout("otp:expire", client.expire(key, OTP_VERIFY_LOCK_SECONDS));
    }
    if (count >= OTP_VERIFY_FAIL_LIMIT) {
      alertOtpRateLimitTriggered(ip, email);
      const lockKey = `otp:verify:email:lock:${scope}`;
      await withRedisCommandTimeout("otp:set", client.set(lockKey, "1", { EX: OTP_VERIFY_LOCK_SECONDS }));
      const ttl = await withRedisCommandTimeout("otp:ttl", client.ttl(lockKey));
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl > 0 ? ttl : OTP_VERIFY_LOCK_SECONDS };
    }
  } catch (error) {
    logError("OTP email verify failure count failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function clearOtpEmailVerifyFailures(email: string, ip: string | null): Promise<void> {
  const client = await getRedisConnection();
  if (!client) return;

  try {
    const scope = verifyScopeId(email.toLowerCase(), ip);
    const failKey = `otp:verify:email:fail:${scope}`;
    const lockKey = `otp:verify:email:lock:${scope}`;
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
