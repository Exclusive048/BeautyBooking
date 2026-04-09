import crypto from "crypto";
import { AppError } from "@/lib/api/errors";
import { getRedisConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import { alertOtpRateLimitTriggered } from "@/lib/monitoring/api-alerts";

const OTP_REQUEST_IP_LIMIT = 5;
const OTP_REQUEST_IP_WINDOW_SECONDS = 60;
const OTP_REQUEST_PHONE_LIMIT = 3;
const OTP_REQUEST_PHONE_WINDOW_SECONDS = 5 * 60;

const OTP_VERIFY_FAIL_LIMIT = 5;
const OTP_VERIFY_LOCK_SECONDS = 15 * 60;
const OTP_VERIFY_RETRY_AFTER_SECONDS = 60;

type RateLimitResult =
  | { ok: true }
  | { ok: false; status: number; error: "RATE_LIMIT" | "RATE_LIMIT_UNAVAILABLE" | "OTP_LOCKED"; retryAfterSec: number };

function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function incrWithWindow(
  key: string,
  windowSeconds: number
): Promise<number> {
  const client = await getRedisConnection();
  if (!client) throw new Error("Redis unavailable");

  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, windowSeconds);
  }
  return count;
}

async function ttlSeconds(key: string): Promise<number> {
  const client = await getRedisConnection();
  if (!client) throw new Error("Redis unavailable");
  const ttl = await client.ttl(key);
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
  const phoneKey = `otp:request:phone:${hashKey(input.phone)}`;

  let ipCount = 0;
  let phoneCount = 0;

  try {
    [ipCount, phoneCount] = await Promise.all([
      incrWithWindow(ipKey, OTP_REQUEST_IP_WINDOW_SECONDS),
      incrWithWindow(phoneKey, OTP_REQUEST_PHONE_WINDOW_SECONDS),
    ]);
  } catch (error) {
    logError("OTP request rate limit failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 503, error: "RATE_LIMIT_UNAVAILABLE", retryAfterSec: 60 };
  }

  if (ipCount > OTP_REQUEST_IP_LIMIT || phoneCount > OTP_REQUEST_PHONE_LIMIT) {
    alertOtpRateLimitTriggered(input.ip, input.phone);
    const retryAfter = Math.max(
      ipCount > OTP_REQUEST_IP_LIMIT ? await ttlSeconds(ipKey) : 0,
      phoneCount > OTP_REQUEST_PHONE_LIMIT ? await ttlSeconds(phoneKey) : 0,
      1
    );
    return { ok: false, status: 429, error: "RATE_LIMIT", retryAfterSec: retryAfter };
  }

  return { ok: true };
}

export async function checkOtpVerifyLock(phone: string): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const lockKey = `otp:verify:lock:${hashKey(phone)}`;
    const ttl = await client.ttl(lockKey);
    if (ttl > 0) {
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl };
    }
  } catch (error) {
    logError("OTP verify lock check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function registerOtpVerifyFailure(phone: string): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const key = `otp:verify:fail:${hashKey(phone)}`;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, OTP_VERIFY_LOCK_SECONDS);
    }
    if (count >= OTP_VERIFY_FAIL_LIMIT) {
      alertOtpRateLimitTriggered(null, phone);
      const lockKey = `otp:verify:lock:${hashKey(phone)}`;
      await client.set(lockKey, "1", { EX: OTP_VERIFY_LOCK_SECONDS });
      const ttl = await client.ttl(lockKey);
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl > 0 ? ttl : OTP_VERIFY_LOCK_SECONDS };
    }
  } catch (error) {
    logError("OTP verify failure count failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function clearOtpVerifyFailures(phone: string): Promise<void> {
  const client = await getRedisConnection();
  if (!client) return;

  try {
    const failKey = `otp:verify:fail:${hashKey(phone)}`;
    const lockKey = `otp:verify:lock:${hashKey(phone)}`;
    await Promise.all([client.del(failKey), client.del(lockKey)]);
  } catch (error) {
    logError("OTP verify lock cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Email OTP rate limit ──────────────────────────────────────────────────────

const OTP_REQUEST_EMAIL_LIMIT = 3;
const OTP_REQUEST_EMAIL_WINDOW_SECONDS = 5 * 60;

export async function checkOtpEmailRequestRateLimit(input: {
  email: string;
  ip: string | null;
}): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    return { ok: false, status: 503, error: "RATE_LIMIT_UNAVAILABLE", retryAfterSec: 60 };
  }

  const ipKey = `otp:request:ip:${hashKey(input.ip?.trim() || "unknown")}`;
  const emailKey = `otp:request:email:${hashKey(input.email.toLowerCase())}`;

  let ipCount = 0;
  let emailCount = 0;

  try {
    [ipCount, emailCount] = await Promise.all([
      incrWithWindow(ipKey, OTP_REQUEST_IP_WINDOW_SECONDS),
      incrWithWindow(emailKey, OTP_REQUEST_EMAIL_WINDOW_SECONDS),
    ]);
  } catch (error) {
    logError("OTP email request rate limit failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 503, error: "RATE_LIMIT_UNAVAILABLE", retryAfterSec: 60 };
  }

  if (ipCount > OTP_REQUEST_IP_LIMIT || emailCount > OTP_REQUEST_EMAIL_LIMIT) {
    alertOtpRateLimitTriggered(input.ip, input.email);
    const retryAfter = Math.max(
      ipCount > OTP_REQUEST_IP_LIMIT ? await ttlSeconds(ipKey) : 0,
      emailCount > OTP_REQUEST_EMAIL_LIMIT ? await ttlSeconds(emailKey) : 0,
      1
    );
    return { ok: false, status: 429, error: "RATE_LIMIT", retryAfterSec: retryAfter };
  }

  return { ok: true };
}

export async function checkOtpEmailVerifyLock(email: string): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const lockKey = `otp:verify:email:lock:${hashKey(email.toLowerCase())}`;
    const ttl = await client.ttl(lockKey);
    if (ttl > 0) {
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl };
    }
  } catch (error) {
    logError("OTP email verify lock check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function registerOtpEmailVerifyFailure(email: string): Promise<RateLimitResult> {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  try {
    const key = `otp:verify:email:fail:${hashKey(email.toLowerCase())}`;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, OTP_VERIFY_LOCK_SECONDS);
    }
    if (count >= OTP_VERIFY_FAIL_LIMIT) {
      alertOtpRateLimitTriggered(null, email);
      const lockKey = `otp:verify:email:lock:${hashKey(email.toLowerCase())}`;
      await client.set(lockKey, "1", { EX: OTP_VERIFY_LOCK_SECONDS });
      const ttl = await client.ttl(lockKey);
      return { ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: ttl > 0 ? ttl : OTP_VERIFY_LOCK_SECONDS };
    }
  } catch (error) {
    logError("OTP email verify failure count failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("Rate limit unavailable", 429, "RATE_LIMITED", {
      retryAfterSec: OTP_VERIFY_RETRY_AFTER_SECONDS,
    });
  }

  return { ok: true };
}

export async function clearOtpEmailVerifyFailures(email: string): Promise<void> {
  const client = await getRedisConnection();
  if (!client) return;

  try {
    const normalized = email.toLowerCase();
    const failKey = `otp:verify:email:fail:${hashKey(normalized)}`;
    const lockKey = `otp:verify:email:lock:${hashKey(normalized)}`;
    await Promise.all([client.del(failKey), client.del(lockKey)]);
  } catch (error) {
    logError("OTP email verify lock cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
