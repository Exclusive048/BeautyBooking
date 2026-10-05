import { describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B1 — ось лимитера пользовательских чтений: вошедший — аккаунт,
 * аноним — IP (`rate-limit/subject.ts`). Подпись настоящая (`auth/jwt`), env
 * подменён ради секрета.
 *
 * @probe 2026-10-03 — в `rateLimitUserIdFromRequest` `selectAccessToken`
 *        заменён на «кука, если есть, иначе Bearer»: красный «Bearer заявлен,
 *        но битый — аноним, даже при живой куке». Возвращено — зелёный.
 */

vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "test-jwt-secret-mobile-b1", AUTH_COOKIE_NAME: "bh_session", NODE_ENV: "test" },
  isProduction: false,
}));

import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { accessTokenSubject, rateLimitUserIdFromRequest, viewerRateLimitKey } from "@/lib/rate-limit/subject";

const URL_FEED = "https://example.test/api/feed/home";

function request(headers: Record<string, string>): Request {
  return new Request(URL_FEED, { headers: { "x-real-ip": "203.0.113.7", ...headers } });
}

const tokenOf = (sub: string) => signAccessToken({ sub, roles: ["CLIENT"], fid: "fam-1" });

describe("accessTokenSubject", () => {
  it("годный access-токен → его sub", () => {
    expect(accessTokenSubject(tokenOf("user-a"))).toBe("user-a");
  });

  it("refresh-токен, мусор, пусто → null", () => {
    expect(accessTokenSubject(signRefreshToken({ sub: "user-a", sid: "s1", jti: "j1" }))).toBeNull();
    expect(accessTokenSubject("a.b.c")).toBeNull();
    expect(accessTokenSubject("")).toBeNull();
    expect(accessTokenSubject(undefined)).toBeNull();
  });
});

describe("rateLimitUserIdFromRequest — то же правило транспорта, что у сессии", () => {
  it("Bearer", () => {
    expect(rateLimitUserIdFromRequest(request({ authorization: `Bearer ${tokenOf("user-a")}` }))).toBe("user-a");
  });

  it("кука bh_session среди прочих", () => {
    expect(
      rateLimitUserIdFromRequest(request({ cookie: `theme=dark; bh_session=${tokenOf("user-b")}; x=1` })),
    ).toBe("user-b");
  });

  it("Bearer заявлен, но битый — аноним, даже при живой куке", () => {
    expect(
      rateLimitUserIdFromRequest(
        request({ authorization: "Bearer broken", cookie: `bh_session=${tokenOf("user-b")}` }),
      ),
    ).toBeNull();
  });

  it("без токенов — аноним", () => {
    expect(rateLimitUserIdFromRequest(request({}))).toBeNull();
  });
});

describe("viewerRateLimitKey", () => {
  it("вошедший — ось user (одна и та же для Bearer и куки одного аккаунта)", () => {
    const viaBearer = viewerRateLimitKey(request({ authorization: `Bearer ${tokenOf("user-a")}` }));
    const viaCookie = viewerRateLimitKey(request({ cookie: `bh_session=${tokenOf("user-a")}` }));
    expect(viaBearer).toBe(routeRateLimitKey(new Request(URL_FEED), "user", "user-a"));
    expect(viaCookie).toBe(viaBearer);
    expect(viaBearer.startsWith("rl:route:user:")).toBe(true);
    expect(viaBearer.endsWith(":/api/feed/home")).toBe(true);
  });

  it("два аккаунта за одним IP — два разных ведра", () => {
    expect(viewerRateLimitKey(request({ authorization: `Bearer ${tokenOf("user-a")}` }))).not.toBe(
      viewerRateLimitKey(request({ authorization: `Bearer ${tokenOf("user-c")}` })),
    );
  });

  it("аноним — ось ip, ключ прежней формы", () => {
    const key = viewerRateLimitKey(request({}));
    expect(key.startsWith("rl:route:ip:")).toBe(true);
    expect(key).toBe(viewerRateLimitKey(request({ authorization: "Bearer broken" })));
  });
});
