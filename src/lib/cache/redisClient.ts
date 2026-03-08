import type { CacheClient } from "@/lib/cache/types";
import { logError } from "@/lib/logging/logger";
import { getRedisConnection } from "@/lib/redis/connection";

async function parseJson<T>(raw: string | null): Promise<T | null> {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const redisClient: CacheClient = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await getRedisConnection();
      if (!client) return null;
      const raw = await client.get(key);
      return parseJson<T>(raw);
    } catch (error) {
      logError("Redis get failed", { key, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const client = await getRedisConnection();
      if (!client) return;
      const payload = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await client.set(key, payload, { EX: ttlSeconds });
      } else {
        await client.set(key, payload);
      }
    } catch (error) {
      logError("Redis set failed", { key, error: error instanceof Error ? error.message : String(error) });
    }
  },
  async del(key: string): Promise<void> {
    try {
      const client = await getRedisConnection();
      if (!client) return;
      await client.del(key);
    } catch (error) {
      logError("Redis del failed", { key, error: error instanceof Error ? error.message : String(error) });
    }
  },
  async delByPattern(pattern: string): Promise<void> {
    try {
      const client = await getRedisConnection();
      if (!client) return;
      let cursor = "0";
      do {
        const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor;
        const keys = result.keys;
        if (keys.length > 0) {
          await client.del(keys);
        }
      } while (cursor !== "0");
    } catch (error) {
      logError("Redis delByPattern failed", {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = await getRedisConnection();
      if (!client) {
        throw new Error("Redis unavailable");
      }
      const result =
        ttlSeconds > 0
          ? await client.set(key, value, { NX: true, EX: ttlSeconds })
          : await client.set(key, value, { NX: true });
      return result === "OK";
    } catch (error) {
      logError("Redis setNx failed", { key, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
};
