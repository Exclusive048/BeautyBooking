import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => null,
  withRedisCommandTimeout: <T>(_op: string, p: Promise<T>) => p,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: async () => {}, trackError: () => 1 }));

import { checkRateLimit } from "@/lib/rate-limit";
import { proxyRateLimitKey, routeRateLimitKey } from "@/lib/rate-limit/keys";

/**
 * 29.09 доработки · 15 — ключ лимита только из конструкторов. Сырая строка и
 * удалённая legacy-перегрузка `(key, limit, window) → boolean` не компилируются
 * (GUARD-INTEGRITY правило 8: где нарушение можно сделать некомпилируемым,
 * сторож не нужен). Директивы `@ts-expect-error` ниже — это и есть пин: если
 * бренд снимут, они станут «неиспользованными», и `typecheck` покраснеет.
 *
 * @probe 2026-09-29 — в `keys.ts` тип заменён на `export type RateLimitKey = string`:
 *        `typecheck` красный — «Unused '@ts-expect-error' directive» на строке
 *        сырой строки (legacy-вызов остался ошибкой по числу аргументов).
 *        Возвращено — зелёный.
 */
describe("RateLimitKey", () => {
  it("сырая строка и legacy-перегрузка не компилируются", async () => {
    const config = { maxRequests: 5, windowSeconds: 60 };
    // @ts-expect-error — сырая строка вместо ключа из конструктора
    await checkRateLimit("rate:x:1", config);
    // @ts-expect-error — перегрузки (key, limit, windowSeconds) больше нет
    await checkRateLimit(routeRateLimitKey(new Request("http://x/api/log-error"), "ip", "1"), 5, 60);
    expect(true).toBe(true);
  });

  it("шаблон пути — последним и из самого запроса", () => {
    const key = routeRateLimitKey(new Request("http://x/api/public/packages/pkg-9/studio/book?x=1"), "ip", "1.2.3.4");
    expect(key.startsWith("rl:route:ip:")).toBe(true);
    expect(key.endsWith(":/api/public/packages/:id/studio/book")).toBe(true);
  });

  it("личность — HMAC: не как есть и одинаково для одной личности", () => {
    const req = new Request("http://x/api/public/bookings", { method: "POST" });
    const a = routeRateLimitKey(req, "phone", "+79991234567");
    expect(a).not.toContain("79991234567");
    expect(routeRateLimitKey(req, "phone", "+79991234567")).toBe(a);
    expect(routeRateLimitKey(req, "phone", "+79991234568")).not.toBe(a);
  });

  it("ключ прокси — прежний формат SEC-03", () => {
    expect(proxyRateLimitKey("publicApi", "1.2.3.4", "GET", "/api/providers/abc/masters")).toBe(
      "rl:publicApi:1.2.3.4:GET:/api/providers/:id/masters",
    );
  });
});
