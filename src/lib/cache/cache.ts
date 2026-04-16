import { env } from "@/lib/env";
import type { CacheClient } from "@/lib/cache/types";
import { redisClient } from "@/lib/cache/redisClient";
import { memoryClient } from "@/lib/cache/memoryClient";
import { logInfo } from "@/lib/logging/logger";

const hasRedisUrl = Boolean(env.REDIS_URL && env.REDIS_URL.trim().length > 0);
const isProduction = env.NODE_ENV === "production";

let client: CacheClient | null = null;

function resolveClient(): CacheClient {
  if (!client) {
    if (hasRedisUrl) {
      client = redisClient;
      logInfo("Cache client selected", { driver: "redis" });
      return client;
    }

    if (isProduction) {
      throw new Error("Redis is required for cache in production");
    }

    client = memoryClient;
    logInfo("Cache client selected", { driver: "memory" });
  }
  return client;
}

export async function get<T>(key: string): Promise<T | null> {
  return resolveClient().get<T>(key);
}

export async function set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  return resolveClient().set<T>(key, value, ttlSeconds);
}

export async function del(key: string): Promise<void> {
  return resolveClient().del(key);
}

export async function delByPattern(pattern: string): Promise<void> {
  return resolveClient().delByPattern(pattern);
}

export async function setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  return resolveClient().setNx(key, value, ttlSeconds);
}
