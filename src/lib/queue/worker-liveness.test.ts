import { describe, expect, it, vi } from "vitest";

/**
 * ADMIN-HEALTH-01 — классификация отметки воркера.
 *
 * @probe  С порогом `<=` вместо `<` отметка ровно на 120 000 мс давала
 *         `alive` — тест «на пороге — stale» краснел.
 */

let rawValue: string | null = null;
let redisAvailable = true;

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => (redisAvailable ? { get: async () => rawValue } : null),
  withRedisCommandTimeout: <T>(_op: string, p: Promise<T>) => p,
}));

import {
  WORKER_ALIVE_THRESHOLD_MS,
  classifyWorkerPing,
  readWorkerLiveness,
} from "@/lib/queue/worker-liveness";

describe("classifyWorkerPing", () => {
  const now = 1_800_000_000_000;

  it("свежая отметка — alive с возрастом", () => {
    expect(classifyWorkerPing(String(now - 12_000), now)).toEqual({ state: "alive", lastPingAgoMs: 12_000 });
  });

  it("на пороге — stale", () => {
    expect(classifyWorkerPing(String(now - WORKER_ALIVE_THRESHOLD_MS), now).state).toBe("stale");
    expect(classifyWorkerPing(String(now - WORKER_ALIVE_THRESHOLD_MS + 1), now).state).toBe("alive");
  });

  it("отметки нет или она мусор — unknown", () => {
    expect(classifyWorkerPing(null, now)).toEqual({ state: "unknown", lastPingAgoMs: null });
    expect(classifyWorkerPing("", now).state).toBe("unknown");
    expect(classifyWorkerPing("abc", now).state).toBe("unknown");
  });

  it("отметка из будущего (рассинхрон часов) не даёт отрицательного возраста", () => {
    expect(classifyWorkerPing(String(now + 5_000), now)).toEqual({ state: "alive", lastPingAgoMs: 0 });
  });
});

describe("readWorkerLiveness", () => {
  it("читает ключ и классифицирует", async () => {
    redisAvailable = true;
    rawValue = String(Date.now() - 1_000);
    const r = await readWorkerLiveness();
    expect(r?.state).toBe("alive");
  });

  it("Redis недоступен — null, не бросает", async () => {
    redisAvailable = false;
    expect(await readWorkerLiveness()).toBeNull();
  });
});
