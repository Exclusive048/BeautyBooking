import type { CacheClient } from "@/lib/cache/types";
import { logError } from "@/lib/logging/logger";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

/**
 * RES-01 — каждая команда кэша идёт через `withRedisCommandTimeout`.
 *
 * Без границы это не ошибка, а ЗАВИСАНИЕ. `redis@5` не выставляет
 * `disableOfflineQueue`, а `reconnectStrategy` в `connection.ts` не сдаётся
 * никогда: во время бесконечного реконнекта `socket.isOpen` остаётся `true`,
 * поэтому `sendCommand` промис не отклоняет — команда уходит в offline-очередь
 * и не резолвится вообще. Обработчик `error` флашит только уже отправленные
 * запросы, не новые.
 *
 * Путь «клиент = null → мягкая деградация» тут не спасает: он срабатывает
 * только если Redis лежал в момент ПЕРВОГО коннекта; при brownout'е
 * `getRedisConnection()` вернёт живой мемоизированный клиент.
 *
 * Потребителей у `cache.ts` 19, включая ядро booking-флоу (`slotsCache`,
 * `dayPlanCache`), каталог, план подписки и идемпотентность, — то есть
 * Redis-brownout вешал слот-пикер до таймаута балансировщика, занимая воркеры
 * Node. Рейт-лимит и очередь в том же сценарии деградируют корректно ровно
 * потому, что обёрнуты давно.
 *
 * Трактовка таймаута — по семантике операции: для чтения и инвалидации это
 * cache-miss (ловится тем же `catch`, что и прочие ошибки), для `setNx`
 * — отказ, потому что «замок не взят» и «замок взят» различать обязательно.
 */
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
      const raw = await withRedisCommandTimeout("cache:get", client.get(key));
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
        await withRedisCommandTimeout("cache:set", client.set(key, payload, { EX: ttlSeconds }));
      } else {
        await withRedisCommandTimeout("cache:set", client.set(key, payload));
      }
    } catch (error) {
      logError("Redis set failed", { key, error: error instanceof Error ? error.message : String(error) });
    }
  },
  async del(key: string): Promise<void> {
    try {
      const client = await getRedisConnection();
      if (!client) return;
      await withRedisCommandTimeout("cache:del", client.del(key));
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
        const result = await withRedisCommandTimeout(
          "cache:scan",
          client.scan(cursor, { MATCH: pattern, COUNT: 100 }),
        );
        cursor = result.cursor;
        const keys = result.keys;
        if (keys.length > 0) {
          await withRedisCommandTimeout("cache:delByPattern", client.del(keys));
        }
      } while (cursor !== "0");
    } catch (error) {
      logError("Redis delByPattern failed", {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  async sAdd(key: string, member: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = await getRedisConnection();
      if (!client) return false;
      await withRedisCommandTimeout("cache:sAdd", client.sAdd(key, member));
      if (ttlSeconds > 0) {
        // TTL продлевается на КАЖДОМ добавлении: множество обязано жить не
        // меньше самого свежего из своих ключей, иначе учёт протухнет раньше
        // учтённого.
        await withRedisCommandTimeout("cache:sAdd:expire", client.expire(key, ttlSeconds));
      }
      return true;
    } catch (error) {
      logError("Redis sAdd failed", { key, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },
  async sMembers(key: string): Promise<string[]> {
    try {
      const client = await getRedisConnection();
      if (!client) return [];
      const members = await withRedisCommandTimeout("cache:sMembers", client.sMembers(key));
      return Array.isArray(members) ? members : [];
    } catch (error) {
      logError("Redis sMembers failed", { key, error: error instanceof Error ? error.message : String(error) });
      return [];
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
          ? await withRedisCommandTimeout(
              "cache:setNx",
              client.set(key, value, { NX: true, EX: ttlSeconds }),
            )
          : await withRedisCommandTimeout(
              "cache:setNx",
              client.set(key, value, { NX: true }),
            );
      return result === "OK";
    } catch (error) {
      logError("Redis setNx failed", { key, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
};
