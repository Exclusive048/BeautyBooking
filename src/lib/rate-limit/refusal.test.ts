import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSilentRedis } from "@/lib/testing/silent-redis";

/**
 * FIX-C11 · GUEST-BOOKING-OUTAGE-CODE-ASYMMETRY — отказ при обрыве отличим от
 * отказа по бюджету.
 *
 * Политика НЕ меняется: и то, и другое — отказ (инв. #6, fail-closed, замерено
 * FIX-C10). Проверяется ровно то, что читает человек и на что реагирует клиент.
 *
 * @probe   что сломать: в `lib/rate-limit/refusal.ts` убрать ветку
 *          `if (unavailable)` (то есть вернуть единственный 429).
 *          наблюдалось: «обрыв обязан читаться как 503 … получено 429» —
 *          красный на обоих поведенческих тестах. Восстановлено, зелено.
 *
 *          Второй пробой (правдоподобная форма, правило 9) — возврат
 *          legacy-перегрузки на путь записи — ловил инвентарь этого файла; с
 *          29.09 доработки · 15 перегрузки нет, и возврат не компилируется
 *          (`keys.test.ts`).
 */

const silent = vi.hoisted(() => ({
  handle: null as ReturnType<typeof createSilentRedis> | null,
  healthy: false,
}));

/** Живой Redis: `incr`/`expire` работают. Моделирует ЗДОРОВУЮ зависимость. */
const counters = vi.hoisted(() => new Map<string, number>());
const healthyClient = vi.hoisted(() => ({
  incr: async (key: string) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  },
  expire: async () => 1,
}));

vi.mock("@/lib/redis/connection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redis/connection")>(
    "@/lib/redis/connection",
  );
  return {
    ...actual,
    getRedisConnection: async () =>
      silent.healthy ? healthyClient : silent.handle!.client,
    getRedisSubscriberConnection: async () => silent.handle!.client,
  };
});
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));
vi.mock("@/lib/monitoring/alerts", () => ({
  sendTelegramAlert: async () => {},
  trackError: () => 1,
}));
vi.mock("@/lib/env", () => ({ isProduction: false, env: { REDIS_URL: "redis://x" } }));

const { resetRedisCircuit } = await import("@/lib/redis/connection");
const { checkRateLimit } = await import("@/lib/rate-limit");
const { routeRateLimitKey } = await import("@/lib/rate-limit/keys");
const { resolveRateLimitRefusal } = await import("@/lib/rate-limit/refusal");

// Ключ ПИШУЩЕГО гостевого пути — его шаблон в `SENSITIVE_ROUTE_TEMPLATES`, то
// есть fail-closed. На несенситивном ключе теста не было бы вовсе: там fail-open.
const GUEST_KEY = routeRateLimitKey(
  new Request("http://x/api/public/bookings", { method: "POST" }),
  "phone",
  "+79991234567",
);
const RATE = { maxRequests: 5, windowSeconds: 60 };

beforeEach(() => {
  silent.handle?.release();
  silent.handle = createSilentRedis();
  silent.healthy = false;
  counters.clear();
  resetRedisCircuit();
});

describe("FIX-C11 · форма отказа называет причину", () => {
  it(
    "🔴 обрыв зависимости → 503 RATE_LIMIT_UNAVAILABLE (первый запрос гостя)",
    async () => {
      const result = await checkRateLimit(GUEST_KEY, RATE);
      const refusal = resolveRateLimitRefusal(result);

      expect(refusal, "путь обязан отказать — это fail-closed, инв. #6").not.toBeNull();
      expect(
        refusal!.status,
        "обрыв обязан читаться как 503 «повторите», а не 429 «вы слишком часто»: " +
          "гость здесь делает ПЕРВЫЙ запрос",
      ).toBe(503);
      expect(refusal!.code).toBe("RATE_LIMIT_UNAVAILABLE");
      expect(refusal!.message).toContain("недоступн");
    },
    20_000,
  );

  it("исчерпанный бюджет при ЖИВОЙ зависимости → 429 RATE_LIMITED", async () => {
    silent.healthy = true;

    // Невакуумность: в пределах бюджета отказа быть не должно вовсе.
    for (let i = 0; i < RATE.maxRequests; i++) {
      expect(resolveRateLimitRefusal(await checkRateLimit(GUEST_KEY, RATE))).toBeNull();
    }

    const refusal = resolveRateLimitRefusal(await checkRateLimit(GUEST_KEY, RATE));
    expect(refusal).not.toBeNull();
    expect(refusal!.status).toBe(429);
    expect(refusal!.code).toBe("RATE_LIMITED");
  });

  it("две оси: недоступность одной перевешивает исчерпанный бюджет другой", async () => {
    // Иначе гость при обрыве читал бы «слишком много запросов» просто потому,
    // что вторая ось успела посчитаться.
    const refusal = resolveRateLimitRefusal(
      { limited: true, retryAfterSeconds: 60 },
      { limited: true, retryAfterSeconds: 60, reason: "unavailable" },
    );
    expect(refusal!.status).toBe(503);
  });

  it("пройденный лимит — не отказ", () => {
    expect(resolveRateLimitRefusal({ limited: false }, { limited: false })).toBeNull();
  });
});

// Инвентарь legacy-перегрузки (`checkRateLimit(key, limit, window) → boolean`),
// живший здесь с FIX-C11, удалён вместе с перегрузкой (29.09 доработки · 15):
// её возврат теперь не компилируется — пин типов в `keys.test.ts`.
