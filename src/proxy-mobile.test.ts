import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-AUTH-A — прокси и нативный клиент.
 *
 * Гоняется настоящий прокси с настоящим лимитером; подменены только Redis
 * (счётчики в памяти + переключатель обрыва), проверка JWT и ротация куки.
 *
 * Что пиннится:
 *  · `Authorization: Bearer` выключает кука-хоп: ротировать куки, которые
 *    обработчик не прочтёт (заголовок главнее куки), — значит сжечь
 *    одноразовый refresh-токен впустую;
 *  · мобильные auth-роуты публичны (без хопа), POST без Origin /
 *    Sec-Fetch-Site не отвергается CSRF-гейтом (приложение — не браузер);
 *  · свои тиры: `mobileAuthRefresh` для refresh, `mobileAuth` для остального,
 *    ключ — по шаблону роута; оба fail-closed при обрыве Redis;
 *  · `/api/mobile/v1/config` — публичный справочник: без хопа и не
 *    fail-closed.
 *
 * @probe 2026-10-03 — убран `isBearerAuthorization(...)` из
 * `skipSessionRefresh` → красный «Bearer + протухшая кука»; убран
 * `"/api/mobile/v1/auth"` из `SENSITIVE_ROUTE_PREFIXES` → красные оба
 * fail-closed-кейса и пин `isSensitiveRouteKey`. Возвращено — зелёный.
 */

const redis = vi.hoisted(() => ({ available: true, counters: new Map<string, number>() }));
const rotateSessionWithTelemetry = vi.hoisted(() => vi.fn(async () => false));

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: vi.fn(async () => {
    if (!redis.available) return null;
    return {
      async incr(key: string) {
        const next = (redis.counters.get(key) ?? 0) + 1;
        redis.counters.set(key, next);
        return next;
      },
      async expire() {
        return true;
      },
    };
  }),
  withRedisCommandTimeout: <T>(_operation: string, promise: Promise<T>) => promise,
}));
vi.mock("@/lib/auth/session-refresh", () => ({ rotateSessionWithTelemetry }));
// Любой access-токен «протух» — ровно та ветка, что уходит в ротацию.
vi.mock("@/lib/auth/jwt", () => ({ verifyToken: vi.fn(() => null) }));

import { isSensitiveRouteKey } from "@/lib/rate-limit";
import { toApiRouteTemplate } from "@/lib/rate-limit/route-template";
import { proxy } from "@/proxy";

const STALE_COOKIES = "bh_session=stale-access; bh_refresh=refresh-token";

async function callProxy(method: string, pathname: string, headers: Record<string, string> = {}) {
  const response = await proxy(new NextRequest(`https://example.test${pathname}`, { method, headers }));
  const passedThrough = response.headers.get("x-middleware-next") === "1";
  const body = passedThrough ? null : await response.json().catch(() => null);
  return { status: response.status, passedThrough, body };
}

function onlyKey(): string {
  const keys = [...redis.counters.keys()];
  expect(keys).toHaveLength(1);
  return keys[0]!;
}

beforeEach(() => {
  redis.available = true;
  redis.counters.clear();
  rotateSessionWithTelemetry.mockClear();
});

describe("кука-хоп и Bearer", () => {
  it("Bearer + протухшая кука — ротации куки нет", async () => {
    const result = await callProxy("GET", "/api/me", {
      authorization: "Bearer access.jwt",
      cookie: STALE_COOKIES,
    });
    expect(result.passedThrough).toBe(true);
    expect(rotateSessionWithTelemetry).not.toHaveBeenCalled();
  });

  it("контроль: та же кука без Bearer — ротация идёт", async () => {
    await callProxy("GET", "/api/me", { cookie: STALE_COOKIES });
    expect(rotateSessionWithTelemetry).toHaveBeenCalledTimes(1);
  });

  it("не-Bearer схема (Basic) хоп не выключает", async () => {
    await callProxy("GET", "/api/me", { authorization: "Basic dTpw", cookie: STALE_COOKIES });
    expect(rotateSessionWithTelemetry).toHaveBeenCalledTimes(1);
  });

  it("мобильные auth-роуты и конфиг — без хопа даже с кукой", async () => {
    await callProxy("POST", "/api/mobile/v1/auth/refresh", { cookie: STALE_COOKIES });
    await callProxy("POST", "/api/mobile/v1/auth/otp/verify", { cookie: STALE_COOKIES });
    await callProxy("GET", "/api/mobile/v1/config", { cookie: STALE_COOKIES });
    expect(rotateSessionWithTelemetry).not.toHaveBeenCalled();
  });
});

describe("мобильные тиры лимитера", () => {
  it("refresh без Origin / Sec-Fetch-Site проходит и считается в mobileAuthRefresh", async () => {
    const result = await callProxy("POST", "/api/mobile/v1/auth/refresh");
    expect(result.status).toBe(200);
    expect(result.passedThrough).toBe(true);
    const key = onlyKey();
    expect(key.startsWith("rl:mobileAuthRefresh:")).toBe(true);
    expect(key.endsWith(":POST:/api/mobile/v1/auth/refresh")).toBe(true);
  });

  it.each([
    "/api/mobile/v1/auth/otp/verify",
    "/api/mobile/v1/auth/otp/email/verify",
    "/api/mobile/v1/auth/logout",
    // MOBILE-AUTH-A2: обмен кода и link-intent — тот же тир (сегменты
    // `oauth` / `exchange` / `link-intent` / `vk` / `yandex` литеральные).
    "/api/mobile/v1/auth/oauth/exchange",
    "/api/mobile/v1/auth/oauth/vk/link-intent",
    "/api/mobile/v1/auth/oauth/yandex/link-intent",
  ])("%s — тир mobileAuth, шаблон без :id", async (pathname) => {
    const result = await callProxy("POST", pathname);
    expect(result.passedThrough).toBe(true);
    const key = onlyKey();
    expect(key.startsWith("rl:mobileAuth:")).toBe(true);
    expect(toApiRouteTemplate(pathname)).toBe(pathname);
    expect(key.endsWith(`:POST:${pathname}`)).toBe(true);
  });

  it("бюджет refresh исчерпан — 429 RATE_LIMITED", async () => {
    await callProxy("POST", "/api/mobile/v1/auth/refresh");
    redis.counters.set(onlyKey(), 10_000);
    const result = await callProxy("POST", "/api/mobile/v1/auth/refresh");
    expect(result.status).toBe(429);
    expect(result.body).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });

  it.each(["/api/mobile/v1/auth/refresh", "/api/mobile/v1/auth/otp/verify"])(
    "обрыв Redis: %s — 503 RATE_LIMIT_UNAVAILABLE, обработчик не вызван",
    async (pathname) => {
      redis.available = false;
      const result = await callProxy("POST", pathname);
      expect(result.passedThrough).toBe(false);
      expect(result.status).toBe(503);
      expect(result.body).toMatchObject({ ok: false, error: { code: "RATE_LIMIT_UNAVAILABLE" } });
    },
  );

  it("обрыв Redis: конфиг не fail-closed — отдаётся", async () => {
    redis.available = false;
    const result = await callProxy("GET", "/api/mobile/v1/config");
    expect(result.passedThrough).toBe(true);
  });

  // MOBILE-B2: push-токен установки — общий `publicApi` (по аккаунту у
  // вошедшего), шаблон без `:id` (сегмент `devices` литеральный), fail-open,
  // как веб-push подписка (путь в `fail-open-mutating-routes.json`).
  it.each(["POST", "DELETE"])("%s /api/mobile/v1/devices — publicApi, шаблон без :id, обрыв Redis не гасит", async (method) => {
    const result = await callProxy(method, "/api/mobile/v1/devices");
    expect(result.passedThrough).toBe(true);
    const key = onlyKey();
    expect(key.startsWith("rl:publicApi:")).toBe(true);
    expect(key.endsWith(`:${method}:/api/mobile/v1/devices`)).toBe(true);

    redis.available = false;
    expect((await callProxy(method, "/api/mobile/v1/devices")).passedThrough).toBe(true);
  });

  it("чувствительность ключей: auth — да, config — нет", () => {
    expect(isSensitiveRouteKey("rl:mobileAuthRefresh:1.2.3.4:POST:/api/mobile/v1/auth/refresh")).toBe(true);
    expect(isSensitiveRouteKey("rl:mobileAuth:1.2.3.4:POST:/api/mobile/v1/auth/otp/verify")).toBe(true);
    expect(isSensitiveRouteKey("rl:publicApi:1.2.3.4:GET:/api/mobile/v1/config")).toBe(false);
  });
});
