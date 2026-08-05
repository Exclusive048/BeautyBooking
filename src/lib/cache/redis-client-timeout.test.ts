import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RES-01 — каждая команда кэша ходила в Redis голой, без command-таймаута.
 *
 * Это не «медленнее», это ЗАВИСАНИЕ НАВСЕГДА. `redis@5` не выставляет
 * `disableOfflineQueue`, а `reconnectStrategy` проекта не сдаётся никогда: во
 * время бесконечного реконнекта `socket.isOpen` остаётся `true`, поэтому
 * `sendCommand` промис не отклоняет — команда уходит в offline-очередь и не
 * резолвится вообще. Мягкая ветка «клиент = null» не спасает: она срабатывает
 * только если Redis лежал в момент ПЕРВОГО коннекта.
 *
 * Потребителей 19, включая ядро booking-флоу, — то есть brownout вешал
 * слот-пикер до таймаута балансировщика, занимая воркеры Node.
 *
 * Тест моделирует ровно этот отказ: команда, которая НИКОГДА не резолвится.
 */

const getRedisConnection = vi.hoisted(() => vi.fn());
const TIMEOUT_MS = 50;

vi.mock("@/lib/redis/connection", async () => {
  // Настоящий `withRedisCommandTimeout` — проверяем поведение, а не заглушку.
  const actual =
    await vi.importActual<typeof import("@/lib/redis/connection")>("@/lib/redis/connection");
  return {
    getRedisConnection,
    withRedisCommandTimeout: <T>(operation: string, promise: Promise<T>) =>
      actual.withRedisCommandTimeout(operation, promise, TIMEOUT_MS),
  };
});
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { redisClient } from "@/lib/cache/redisClient";

/** Клиент, чьи команды не резолвятся никогда — тот самый brownout. */
function hangingClient() {
  const never = () => new Promise(() => {});
  return {
    get: vi.fn(never),
    set: vi.fn(never),
    del: vi.fn(never),
    scan: vi.fn(never),
  };
}

beforeEach(() => {
  getRedisConnection.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("redisClient — зависший Redis деградирует, а не вешает запрос (RES-01)", () => {
  it("get отдаёт cache-miss вместо вечного ожидания", async () => {
    getRedisConnection.mockResolvedValue(hangingClient());
    await expect(redisClient.get("slots:1")).resolves.toBeNull();
  });

  it("set завершается, а не висит", async () => {
    getRedisConnection.mockResolvedValue(hangingClient());
    await expect(redisClient.set("slots:1", { a: 1 }, 60)).resolves.toBeUndefined();
  });

  it("del завершается", async () => {
    getRedisConnection.mockResolvedValue(hangingClient());
    await expect(redisClient.del("slots:1")).resolves.toBeUndefined();
  });

  it("delByPattern завершается и не крутит бесконечный цикл SCAN", async () => {
    getRedisConnection.mockResolvedValue(hangingClient());
    await expect(redisClient.delByPattern("slots:*")).resolves.toBeUndefined();
  });

  it("setNx БРОСАЕТ — «замок не взят» нельзя спутать со «взят»", async () => {
    getRedisConnection.mockResolvedValue(hangingClient());
    await expect(redisClient.setNx("lock:x", "1", 60)).rejects.toMatchObject({
      code: "REDIS_COMMAND_TIMEOUT",
    });
  });
});

describe("ни одна команда кэша не осталась голой (RES-01)", () => {
  it("каждый вызов клиента обёрнут таймаутом", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/cache/redisClient.ts"), "utf8");
    // Голый `await client.<cmd>(` — форма, которую фикс убирает.
    const bare = source.match(/await\s+client\.\w+\s*\(/g) ?? [];
    expect(bare, `голые команды: ${bare.join(", ")}`).toEqual([]);
    expect(source).toContain("withRedisCommandTimeout");
  });
});
