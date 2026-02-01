import { getRedisConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();

function nowMs() {
  return Date.now();
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

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const client = await getRedisConnection();
    if (!client) {
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
    return true;
  }
}
