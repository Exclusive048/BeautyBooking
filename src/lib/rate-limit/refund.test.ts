import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-CLIENT-01 (B7) — `refundRateLimit` возвращает одну израсходованную
 * попытку: после возврата тот же ключ снова проходит, счётчик не уходит ниже
 * нуля и ключ без срока не появляется, сбой Redis не бросает.
 *
 * @probe 2026-10-03 — удаление ключа при остатке ≤ 0 убрано: покраснел «ключ,
 *        истёкший до возврата, не воскресает с −1 без срока» (`expected -1 to be
 *        -2`). Возвращено — зелёный.
 */

type Entry = { value: number; expireAt: number | null };

const redis = vi.hoisted(() => ({
  store: new Map<string, Entry>(),
  failNext: false,
}));

function live(key: string): Entry | undefined {
  const e = redis.store.get(key);
  if (!e) return undefined;
  if (e.expireAt !== null && e.expireAt <= Date.now()) {
    redis.store.delete(key);
    return undefined;
  }
  return e;
}

const client = vi.hoisted(() => ({
  async incr(key: string) {
    const e = live(key);
    const next = (e?.value ?? 0) + 1;
    redis.store.set(key, { value: next, expireAt: e?.expireAt ?? null });
    return next;
  },
  async decr(key: string) {
    if (redis.failNext) {
      redis.failNext = false;
      throw new Error("Redis command timeout: operation=decr");
    }
    const e = live(key);
    const next = (e?.value ?? 0) - 1;
    redis.store.set(key, { value: next, expireAt: e?.expireAt ?? null });
    return next;
  },
  async expire(key: string, seconds: number, mode?: "NX") {
    const e = live(key);
    if (!e) return 0;
    if (mode === "NX" && e.expireAt !== null) return 0;
    e.expireAt = Date.now() + seconds * 1000;
    return 1;
  },
  async ttl(key: string) {
    const e = live(key);
    if (!e) return -2;
    if (e.expireAt === null) return -1;
    return Math.ceil((e.expireAt - Date.now()) / 1000);
  },
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (redis.store.delete(k)) n += 1;
    return n;
  },
}));

vi.mock("@/lib/redis/connection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redis/connection")>("@/lib/redis/connection");
  return { ...actual, getRedisConnection: async () => client };
});
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: async () => {}, trackError: () => 1 }));
vi.mock("@/lib/env", () => ({ isProduction: false, env: { REDIS_URL: "redis://x", AUTH_JWT_SECRET: "x" } }));

import { checkRateLimit, refundRateLimit, type RateLimitKey } from "@/lib/rate-limit";

const KEY = "rl:route:user:abc:/api/me/delete" as RateLimitKey;
const ONE_PER_HOUR = { windowSeconds: 3600, maxRequests: 1 };

beforeEach(() => {
  redis.store.clear();
  redis.failNext = false;
});

describe("refundRateLimit", () => {
  it("возвращённая попытка снова проходит", async () => {
    expect((await checkRateLimit(KEY, ONE_PER_HOUR)).limited).toBe(false);
    expect((await checkRateLimit(KEY, ONE_PER_HOUR)).limited).toBe(true);

    await refundRateLimit(KEY);
    await refundRateLimit(KEY);
    expect((await checkRateLimit(KEY, ONE_PER_HOUR)).limited).toBe(false);
    expect((await checkRateLimit(KEY, ONE_PER_HOUR)).limited).toBe(true);
  });

  it("ключ, истёкший до возврата, не воскресает с −1 без срока", async () => {
    await refundRateLimit(KEY);
    expect(await client.ttl(KEY)).toBe(-2);
    // Окно начинается заново как обычно — со сроком.
    expect((await checkRateLimit(KEY, ONE_PER_HOUR)).limited).toBe(false);
    expect(await client.ttl(KEY)).toBeGreaterThan(0);
  });

  it("сбой Redis не бросает", async () => {
    redis.failNext = true;
    await expect(refundRateLimit(KEY)).resolves.toBeUndefined();
  });
});
