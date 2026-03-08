import { getRedisConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";

export type RateLimitConfig = {
  windowSeconds: number;
  maxRequests: number;
};

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();
const SENSITIVE_ROUTE_PREFIXES = [
  "/api/auth",
  "/api/bookings",
  "/api/payments",
  "/api/categories/propose",
  "/api/master/portfolio",
  "/api/studio",
  "/api/studios",
  "/api/reviews",
] as const;
const SENSITIVE_KEY_PREFIXES = [
  "rate:createBooking:",
  "rl:categories:propose:",
  "rl:/api/bookings",
  "rl:/api/master/portfolio",
  "rl:/api/studio",
  "rl:/api/studios",
  "rl:/api/reviews",
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

function isSensitiveRouteKey(key: string): boolean {
  if (SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return true;
  }
  const path = extractApiPathFromKey(key);
  if (!path) return false;
  return SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function checkMemoryLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = nowMs();
  const windowMs = windowSeconds * 1000;
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

function maybeAlertRedisRateLimitFailOpen(): void {
  const count = trackError("redis:rate-limit");
  if (count === 3) {
    sendTelegramAlert(
      "\u26A0\uFE0F Redis \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 rate limit \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D (3 \u043E\u0448\u0438\u0431\u043A\u0438 \u0437\u0430 \u043C\u0438\u043D\u0443\u0442\u0443)",
      "redis:rate-limit:unavailable"
    );
  }
}

async function checkRateLimitConfig(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const client = await getRedisConnection();
    if (!client) {
      if (isSensitiveRouteKey(key)) {
        return { limited: true, retryAfterSeconds: RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS };
      }
      logError("Rate limit Redis unavailable, fail-open", { key, mode: "config", __skipAlert: true });
      maybeAlertRedisRateLimitFailOpen();
      return { limited: false };
    }

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, config.windowSeconds);
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
      return { limited: true, retryAfterSeconds: RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS };
    }
    maybeAlertRedisRateLimitFailOpen();
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
      logError("Rate limit Redis unavailable, fail-open", { key, mode: "legacy", __skipAlert: true });
      maybeAlertRedisRateLimitFailOpen();
      return checkMemoryLimit(key, limit, windowSeconds);
    }

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
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
    maybeAlertRedisRateLimitFailOpen();
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
