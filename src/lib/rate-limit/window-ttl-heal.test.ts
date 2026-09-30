import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RATE-LIMIT-TTL-HEAL (29.09 доработки) — ключ лимита, потерявший срок окна,
 * не блокирует адрес навсегда.
 *
 * Срок ставится командой EXPIRE на ПЕРВОМ инкременте. Если она не дошла
 * (таймаут при brownout Redis, падение процесса между INCR и EXPIRE), ключ
 * остаётся без срока, счётчик только растёт, и после превышения лимита маршрут
 * для этого адреса закрыт навсегда. Найдено живьём на dev: ключ
 * `rl:publicApi:::1:GET:/api/media` — TTL −1, счётчик 152, 429 на каждый запрос
 * и после минуты ожидания. Лимитер теперь на превышении досылает срок с `NX`.
 *
 * Фейк Redis моделирует сроки по-настоящему (включая `NX`: срок ставится,
 * только если его нет), а «потерянный» EXPIRE — отказом команды.
 *
 * @probe 2026-09-29 — в `lib/rate-limit/index.ts` досыл срока в ветке
 *        превышения (config-перегрузка) заменён на `Promise.resolve(0)`: красный
 *        «потерявший срок ключ живёт не дольше окна» — `expected -1 to be 60`.
 *        (Случай legacy-перегрузки ушёл вместе с ней — 29.09 доработки · 15.)
 *        В `otp-rate-limit.ts` так же снят досыл у `registerOtpVerifyFailure`:
 *        красный «счётчик неудач кода» — `expected -1 to be greater than 0`.
 *        Возвращено — 4/4.
 */

type Entry = { value: number; expireAt: number | null };

const redis = vi.hoisted(() => ({
  store: new Map<string, Entry>(),
  loseNextExpire: false,
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
  async expire(key: string, seconds: number, mode?: "NX" | "XX" | "GT" | "LT") {
    if (redis.loseNextExpire) {
      redis.loseNextExpire = false;
      throw new Error("Redis command timeout: operation=expire");
    }
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
  async set(key: string, _value: string, opts?: { EX?: number }) {
    redis.store.set(key, { value: 1, expireAt: opts?.EX ? Date.now() + opts.EX * 1000 : null });
    return "OK";
  },
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (redis.store.delete(k)) n += 1;
    return n;
  },
  async get(key: string) {
    const e = live(key);
    return e ? String(e.value) : null;
  },
}));

vi.mock("@/lib/redis/connection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redis/connection")>("@/lib/redis/connection");
  return { ...actual, getRedisConnection: async () => client };
});
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: async () => {}, trackError: () => 1 }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ alertOtpRateLimitTriggered: () => {} }));
vi.mock("@/lib/env", () => ({ isProduction: false, env: { REDIS_URL: "redis://x", OTP_HMAC_SECRET: "x" } }));

const { checkRateLimit } = await import("@/lib/rate-limit");
const { routeRateLimitKey } = await import("@/lib/rate-limit/keys");
const { registerOtpVerifyFailure } = await import("@/lib/auth/otp-rate-limit");

const KEY = routeRateLimitKey(new Request("http://x/api/media"), "ip", "198.51.100.9");
const CONFIG = { windowSeconds: 60, maxRequests: 3 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  redis.store.clear();
  redis.loseNextExpire = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("лимитер: срок окна", () => {
  it("потерявший срок ключ живёт не дольше окна (config-перегрузка)", async () => {
    redis.loseNextExpire = true;
    await checkRateLimit(KEY, CONFIG); // 1: EXPIRE «потерян»
    expect(await client.ttl(KEY)).toBe(-1);
    await checkRateLimit(KEY, CONFIG); // 2
    await checkRateLimit(KEY, CONFIG); // 3
    expect(await checkRateLimit(KEY, CONFIG)).toMatchObject({ limited: true }); // 4 > 3
    expect(await client.ttl(KEY)).toBe(60);

    vi.setSystemTime(new Date("2026-09-29T12:01:01Z"));
    expect(await checkRateLimit(KEY, CONFIG)).toEqual({ limited: false });
  });

  it("исправное окно не продлевается досылом", async () => {
    await checkRateLimit(KEY, CONFIG); // срок до 12:01:00
    vi.setSystemTime(new Date("2026-09-29T12:00:30Z"));
    for (let i = 0; i < 5; i += 1) await checkRateLimit(KEY, CONFIG);
    expect(await client.ttl(KEY)).toBe(30);
    vi.setSystemTime(new Date("2026-09-29T12:01:00Z"));
    expect(await checkRateLimit(KEY, CONFIG)).toEqual({ limited: false });
  });

  it("счётчик неудач кода: срок доставляется со второй неудачи", async () => {
    redis.loseNextExpire = true;
    // Потерянная команда — отказ fail-closed (RES-11), но инкремент уже применён.
    await expect(registerOtpVerifyFailure("+79995550000", "198.51.100.9")).rejects.toBeInstanceOf(Error);
    const failKey = [...redis.store.keys()].find((k) => k.includes("fail"));
    expect(failKey).toBeDefined();
    expect(await client.ttl(failKey!)).toBe(-1);
    await registerOtpVerifyFailure("+79995550000", "198.51.100.9");
    expect(await client.ttl(failKey!)).toBeGreaterThan(0);
  });
});
