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

/**
 * FIX-C11 — исход попытки занять замок. **Три состояния, не два.**
 *
 * 🔴 Почему это тип, а не `boolean`: у `boolean` третье состояние выразить
 * нечем, и вызывающие держали о нём ЧАСТНОЕ, ничем не проверяемое мнение.
 * `withSingleFlight` верил, что «команда не прошла» приходит как `false`
 * (правило 2 в его собственной шапке утверждало это дословно), а приходило
 * исключение — и оно уходило в обработчик роута: при остановленном Redis
 * `/slots`, `/booking-days` и `/availability` отвечали **500**, то есть гость
 * не доходил до кнопки отправки, пока каталог отвечал 200.
 *
 * Перевести это в один блаженный `catch` на уровне слоя **нельзя**: у замка
 * «зависимость недоступна» — не «свободен» и не «занят», а правильный ответ
 * РАЗНЫЙ у каждого вызывающего (перечисление — в отчёте FIX-C11):
 *
 *   · single-flight  → замок пропустить, работу СДЕЛАТЬ (дубль дешевле отказа);
 *   · идемпотентность → отказать (без замка гарантию не выдать);
 *   · claim tg-hash  → пропустить (основная защита — state-cookie);
 *   · лок прогона продлений → продолжить без него (инв. #4 держит деньги);
 *   · dedup-сторожа уведомлений → не рассылать (дубль виден пользователю).
 *
 * Пять разных ответов из одного примитива — значит место решения именно у
 * вызывающего, а обязанность слоя — сделать третье состояние **невозможным для
 * молчаливого пропуска**. Поэтому `setNx` из фасада НЕ экспортируется вовсе:
 * `.acquired` на этом типе не существует до сужения по `status`, то есть
 * прежняя форма дефекта (`if (!acquired)`) не компилируется, а не «ловится
 * регекспом».
 *
 * ⚠️ `unavailable` означает «замок не наблюдался», а не строго «Redis молчит»:
 * сюда попадает и настоящая ошибка команды. Это осознанно и совпадает с тем,
 * как `get` трактует любую ошибку как промах, — различение потребовало бы
 * второй команды ради ветки, которой ни у одного вызывающего нет.
 */
export type LockClaim =
  | { status: "acquired" }
  | { status: "held" }
  | { status: "unavailable"; error: unknown };

export async function claimLock(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<LockClaim> {
  try {
    const acquired = await resolveClient().setNx(key, value, ttlSeconds);
    return acquired ? { status: "acquired" } : { status: "held" };
  } catch (error) {
    return { status: "unavailable", error };
  }
}

export async function sAdd(key: string, member: string, ttlSeconds: number): Promise<boolean> {
  return resolveClient().sAdd(key, member, ttlSeconds);
}

export async function sMembers(key: string): Promise<string[]> {
  return resolveClient().sMembers(key);
}
