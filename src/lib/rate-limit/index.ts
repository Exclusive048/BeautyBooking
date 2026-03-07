import { getRedisConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";

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
const SENSITIVE_ROUTE_PREFIXES = ["/api/auth", "/api/bookings", "/api/payments"] as const;
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
