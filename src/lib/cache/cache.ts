import type { CacheClient } from "@/lib/cache/types";
import { redisClient } from "@/lib/cache/redisClient";
import { memoryClient } from "@/lib/cache/memoryClient";
import { logInfo } from "@/lib/logging/logger";

const hasRedisUrl = Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0);

let client: CacheClient | null = null;

function resolveClient(): CacheClient {
  if (!client) {
    client = hasRedisUrl ? redisClient : memoryClient;
    logInfo("Cache client selected", { driver: hasRedisUrl ? "redis" : "memory" });
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
