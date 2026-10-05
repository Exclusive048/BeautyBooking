import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-AUTH-A — `Authorization: Bearer <access JWT>` наравне с кукой.
 *
 * Нативное приложение кук не держит. Обе точки чтения сессии
 * (`getSessionUserFromRequest` — по Request, `getSessionUser`/`getSessionUserId`
 * — через `next/headers`) обязаны принимать заголовок с ТОЙ ЖЕ проверкой, что и
 * куку: тип токена, подпись, срок, живая семья (SEC-13). Правило выбора —
 * «заявлена схема Bearer → решает заголовок», даже битый: иначе протухший
 * Bearer молча «чинился» бы случайной кукой.
 *
 * @probe 2026-10-03 — в `getAccessTokenFromRequest` порядок заменён на «кука
 *        главнее», в `getAccessSessionPayload` убрано чтение заголовка:
 *        4 красных — «заголовок главнее куки», «битый Bearer не подменяется
 *        кукой», «getSessionUser читает Bearer…», «getSessionUserId…».
 *        Возвращено — 13/13 зелёных.
 */

const state = vi.hoisted(() => ({
  familyAlive: true,
  headerJar: new Map<string, string>(),
  cookieJar: new Map<string, string>(),
  cookiesCalls: 0,
}));

const findFirst = vi.hoisted(() =>
  vi.fn(async (args: { where: { id: string } & Record<string, unknown> }) => {
    if ("refreshSessions" in args.where && !state.familyAlive) return null;
    return { id: args.where.id, roles: ["CLIENT"] };
  }),
);

vi.mock("@/lib/prisma", () => ({ prisma: { userProfile: { findFirst } } }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(Object.fromEntries(state.headerJar)),
  cookies: async () => {
    state.cookiesCalls += 1;
    return {
      get: (name: string) => {
        const value = state.cookieJar.get(name);
        return value ? { name, value } : undefined;
      },
    };
  },
}));
vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "test-jwt-secret-mobile-auth-a", AUTH_COOKIE_NAME: "bh_session", NODE_ENV: "test" },
  isProduction: false,
}));

import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { isBearerAuthorization, parseBearerToken, selectAccessToken } from "@/lib/auth/bearer";
import { getSessionUser, getSessionUserFromRequest, getSessionUserId } from "@/lib/auth/session";

function access(sub: string, fid = "fam-1"): string {
  return signAccessToken({ sub, roles: ["CLIENT"], fid });
}

function req(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/me", { headers });
}

beforeEach(() => {
  state.familyAlive = true;
  state.headerJar.clear();
  state.cookieJar.clear();
  state.cookiesCalls = 0;
  findFirst.mockClear();
});

describe("bearer.ts — разбор заголовка", () => {
  it("схема регистронезависима, лишние пробелы допустимы", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearerToken("bearer   abc")).toBe("abc");
    expect(parseBearerToken("  BEARER abc  ")).toBe("abc");
  });

  it("пустой или многословный Bearer — схема заявлена, токена нет", () => {
    expect(isBearerAuthorization("Bearer")).toBe(true);
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer a b")).toBeNull();
  });

  it("чужие схемы — не Bearer", () => {
    expect(isBearerAuthorization("Basic dXNlcjpwYXNz")).toBe(false);
    expect(isBearerAuthorization("Bearerish token")).toBe(false);
    expect(isBearerAuthorization(null)).toBe(false);
  });

  it("выбор: Bearer главнее куки, иначе — кука", () => {
    expect(selectAccessToken("Bearer header-token", "cookie-token")).toBe("header-token");
    expect(selectAccessToken("Bearer", "cookie-token")).toBeNull();
    expect(selectAccessToken("Basic x", "cookie-token")).toBe("cookie-token");
    expect(selectAccessToken(null, undefined)).toBeNull();
  });
});

describe("getSessionUserFromRequest — Bearer", () => {
  it("валидный Bearer без кук даёт пользователя", async () => {
    const user = await getSessionUserFromRequest(req({ authorization: `Bearer ${access("u-bearer")}` }));
    expect(user?.id).toBe("u-bearer");
  });

  it("проверка семьи — та же, что у куки (SEC-13)", async () => {
    await getSessionUserFromRequest(req({ authorization: `Bearer ${access("u-bearer", "fam-9")}` }));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "u-bearer",
          isDeleted: false,
          refreshSessions: { some: { familyId: "fam-9", revokedAt: null } },
        },
      }),
    );
    state.familyAlive = false;
    expect(await getSessionUserFromRequest(req({ authorization: `Bearer ${access("u-bearer")}` }))).toBeNull();
  });

  it("заголовок главнее куки", async () => {
    const user = await getSessionUserFromRequest(
      req({ authorization: `Bearer ${access("u-header")}`, cookie: `bh_session=${access("u-cookie")}` }),
    );
    expect(user?.id).toBe("u-header");
  });

  it("битый Bearer не подменяется кукой — запрос анонимный", async () => {
    const user = await getSessionUserFromRequest(
      req({ authorization: "Bearer not-a-jwt", cookie: `bh_session=${access("u-cookie")}` }),
    );
    expect(user).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refresh-токен в Bearer не принимается за access", async () => {
    const refresh = signRefreshToken({ sub: "u-bearer", sid: "s1", jti: "j1" });
    expect(await getSessionUserFromRequest(req({ authorization: `Bearer ${refresh}` }))).toBeNull();
  });

  it("чужая схема (Basic от staging-прокси) не мешает куке", async () => {
    const user = await getSessionUserFromRequest(
      req({ authorization: "Basic dXNlcjpwYXNz", cookie: `bh_session=${access("u-cookie")}` }),
    );
    expect(user?.id).toBe("u-cookie");
  });
});

describe("путь без Request (next/headers) — Bearer", () => {
  it("getSessionUser читает Bearer и не трогает куки", async () => {
    state.headerJar.set("authorization", `Bearer ${access("u-bearer")}`);
    state.cookieJar.set("bh_session", access("u-cookie"));
    const user = await getSessionUser();
    expect(user?.id).toBe("u-bearer");
    expect(state.cookiesCalls).toBe(0);
  });

  it("getSessionUserId (GET /api/me) — тоже через семью", async () => {
    state.headerJar.set("authorization", `Bearer ${access("u-bearer")}`);
    expect(await getSessionUserId()).toBe("u-bearer");
    state.familyAlive = false;
    expect(await getSessionUserId()).toBeNull();
  });

  it("без заголовка — по-прежнему кука", async () => {
    state.cookieJar.set("bh_session", access("u-cookie"));
    expect((await getSessionUser())?.id).toBe("u-cookie");
  });
});
