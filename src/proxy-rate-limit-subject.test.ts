import { NextRequest, type NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B1 — ось ключа тиров прокси: вошедший — по аккаунту, аноним и
 * auth-поверхность — по IP.
 *
 * Гоняется настоящий прокси с настоящим лимитером; подменены Redis (счётчики в
 * памяти), проверка JWT (токен `tok:<userId>` годен, прочее — нет) и ротация
 * куки.
 *
 * Что пиннится:
 *  · два аккаунта за одним IP (CGNAT) — два ведра; аноним — ведро IP;
 *  · вход/OTP/refresh/мобильные auth-роуты и вебхук — по IP даже с сессией;
 *  · Bearer решает заголовком (битый Bearer + живая кука = аноним);
 *  · после ротации куки лимит — по владельцу свежей сессии;
 *  · подпись куки проверяется ОДИН раз на запрос (и для хопа, и для лимита);
 *  · `GET /api/media/file/*` — свой тир `mediaRead`.
 *
 * @probe 2026-10-03 — `rateLimitAxisFor` всегда возвращает "user": красные
 *        «вход и OTP — по IP даже с сессией» и «вебхук — по IP». Возвращено —
 *        зелёный.
 * @probe 2026-10-03 — в прокси `readCookieSubject()` заменён прямым вызовом
 *        `accessTokenSubject(...)` без запоминания: красные «подпись куки —
 *        один раз» и «после ротации куки» (ключ брался по протухшей куке).
 *        Возвращено — зелёный.
 */

const redis = vi.hoisted(() => ({ counters: new Map<string, number>() }));
const verifyToken = vi.hoisted(() =>
  vi.fn((token: string) => (token.startsWith("tok:") ? { sub: token.slice(4), tokenType: "access" } : null)),
);
const rotateSessionWithTelemetry = vi.hoisted(() =>
  vi.fn<(response: NextResponse, refreshToken: string) => Promise<boolean>>(async () => false),
);

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: vi.fn(async () => ({
    async incr(key: string) {
      const next = (redis.counters.get(key) ?? 0) + 1;
      redis.counters.set(key, next);
      return next;
    },
    async expire() {
      return true;
    },
  })),
  withRedisCommandTimeout: <T>(_operation: string, promise: Promise<T>) => promise,
}));
vi.mock("@/lib/auth/session-refresh", () => ({ rotateSessionWithTelemetry }));
vi.mock("@/lib/auth/jwt", () => ({ verifyToken }));

import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { proxy, rateLimitAxisFor } from "@/proxy";

async function callProxy(method: string, pathname: string, headers: Record<string, string> = {}) {
  const response = await proxy(
    new NextRequest(`https://example.test${pathname}`, {
      method,
      headers: { "x-real-ip": "198.51.100.10", ...headers },
    }),
  );
  return { status: response.status, passedThrough: response.headers.get("x-middleware-next") === "1" };
}

function onlyKey(): string {
  const keys = [...redis.counters.keys()];
  expect(keys).toHaveLength(1);
  return keys[0]!;
}

beforeEach(() => {
  redis.counters.clear();
  verifyToken.mockClear();
  rotateSessionWithTelemetry.mockReset();
  rotateSessionWithTelemetry.mockResolvedValue(false);
});

describe("rateLimitAxisFor", () => {
  it.each([
    ["publicApi", "/api/feed/home", "user"],
    ["publicApi", "/api/me/sessions", "user"],
    ["cabinetMutation", "/api/cabinet/master/services", "user"],
    ["bookingCreate", "/api/bookings", "user"],
    ["reviewCreate", "/api/reviews", "user"],
    ["mediaUpload", "/api/media", "user"],
    ["modelOffer", "/api/model-offers", "user"],
    ["modelApplication", "/api/model-applications", "user"],
    ["mediaRead", "/api/media/file/abc", "user"],
    ["publicApi", "/api/auth/otp/request", "ip"],
    ["publicApi", "/api/auth/otp/verify", "ip"],
    ["publicApi", "/api/auth/telegram/login", "ip"],
    ["publicApi", "/api/mobile/v1/auth/oauth/vk/start", "ip"],
    ["mobileAuth", "/api/mobile/v1/auth/otp/verify", "ip"],
    ["mobileAuthRefresh", "/api/mobile/v1/auth/refresh", "ip"],
    ["webhookIngress", "/api/payments/yookassa/webhook", "ip"],
    // Префикс — по сегменту: `/api/authors` (если появится) не auth-поверхность.
    ["publicApi", "/api/authors", "user"],
  ] as const)("%s %s → %s", (tier, pathname, axis) => {
    expect(rateLimitAxisFor(tier, pathname)).toBe(axis);
  });
});

describe("ключ тира прокси", () => {
  it("аноним — ведро IP, прежний формат", async () => {
    await callProxy("GET", "/api/feed/home");
    expect(onlyKey()).toBe("rl:publicApi:198.51.100.10:GET:/api/feed/home");
  });

  it("Bearer — ведро аккаунта; два аккаунта за одним IP не делят бюджет", async () => {
    await callProxy("GET", "/api/feed/home", { authorization: "Bearer tok:user-a" });
    await callProxy("GET", "/api/feed/home", { authorization: "Bearer tok:user-b" });
    const keys = [...redis.counters.keys()];
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).toMatch(/^rl:publicApi:user:[0-9a-f]{32}:GET:\/api\/feed\/home$/);
      expect(key).not.toContain("198.51.100.10");
      expect(key).not.toContain("user-a");
    }
  });

  it("исчерпанный бюджет одного аккаунта не трогает соседа по IP", async () => {
    const budget = RATE_LIMITS.cabinetMutation.maxRequests;
    for (let i = 0; i < budget; i += 1) {
      expect((await callProxy("POST", "/api/cabinet/master/x", { authorization: "Bearer tok:user-a" })).passedThrough).toBe(true);
    }
    expect((await callProxy("POST", "/api/cabinet/master/x", { authorization: "Bearer tok:user-a" })).status).toBe(429);
    expect((await callProxy("POST", "/api/cabinet/master/x", { authorization: "Bearer tok:user-b" })).passedThrough).toBe(true);
    expect((await callProxy("POST", "/api/cabinet/master/x")).passedThrough).toBe(true);
  });

  it("живая кука — ведро аккаунта, без ротации", async () => {
    await callProxy("GET", "/api/feed/home", { cookie: "bh_session=tok:user-c" });
    expect(onlyKey()).toMatch(/^rl:publicApi:user:/);
    expect(rotateSessionWithTelemetry).not.toHaveBeenCalled();
  });

  it("подпись куки — один раз на запрос (хоп и лимит делят результат)", async () => {
    await callProxy("GET", "/api/feed/home", { cookie: "bh_session=tok:user-c" });
    expect(verifyToken).toHaveBeenCalledTimes(1);
  });

  it("битый Bearer при живой куке — аноним (решает заголовок)", async () => {
    await callProxy("GET", "/api/feed/home", { authorization: "Bearer broken", cookie: "bh_session=tok:user-c" });
    expect(onlyKey()).toBe("rl:publicApi:198.51.100.10:GET:/api/feed/home");
  });

  it("после ротации куки — ведро владельца свежей сессии", async () => {
    rotateSessionWithTelemetry.mockImplementation(async (carrier: NextResponse) => {
      carrier.headers.append("set-cookie", "bh_session=tok:user-d; Path=/; HttpOnly");
      carrier.headers.append("set-cookie", "bh_refresh=next-refresh; Path=/; HttpOnly");
      return true;
    });
    await callProxy("GET", "/api/feed/home", { cookie: "bh_session=stale; bh_refresh=old-refresh" });
    expect(rotateSessionWithTelemetry).toHaveBeenCalledTimes(1);
    expect(onlyKey()).toMatch(/^rl:publicApi:user:/);
  });

  it("вход и OTP — по IP даже с сессией", async () => {
    await callProxy("POST", "/api/auth/otp/request", { authorization: "Bearer tok:user-a" });
    expect(onlyKey()).toBe("rl:publicApi:198.51.100.10:POST:/api/auth/otp/request");
    redis.counters.clear();
    await callProxy("POST", "/api/mobile/v1/auth/otp/verify", { authorization: "Bearer tok:user-a" });
    expect(onlyKey()).toBe("rl:mobileAuth:198.51.100.10:POST:/api/mobile/v1/auth/otp/verify");
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("вебхук — по IP", async () => {
    await callProxy("POST", "/api/payments/yookassa/webhook", { authorization: "Bearer tok:user-a" });
    expect(onlyKey()).toBe("rl:webhookIngress:198.51.100.10:POST:/api/payments/yookassa/webhook");
  });

  it("байты медиа — свой тир mediaRead (и превью, и вырез)", async () => {
    await callProxy("GET", "/api/media/file/cmasset1?w=320");
    await callProxy("GET", "/api/media/file/cmasset1/crop/1-2-3-4");
    expect([...redis.counters.keys()].sort()).toEqual([
      "rl:mediaRead:198.51.100.10:GET:/api/media/file/:id",
      "rl:mediaRead:198.51.100.10:GET:/api/media/file/:id/crop/:id",
    ]);
    expect(RATE_LIMITS.mediaRead.maxRequests).toBeGreaterThan(RATE_LIMITS.publicApi.maxRequests);
  });
});
