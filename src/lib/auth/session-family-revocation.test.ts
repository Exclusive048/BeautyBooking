import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * SEC-13 — отзыв сессии действует сразу, а не через два часа.
 *
 * Access-токен не нёс идентификатора сессии, а проверка сводилась к
 * `userProfile.findFirst({ id, isDeleted: false })`. «Завершить все остальные
 * сессии» и logout гасили только строки `RefreshSession`, поэтому украденный
 * access-токен продолжал работать до конца своего TTL — до 2 часов. Именно в
 * этом окне и находится злоумышленник, из-за которого кнопку нажали.
 *
 * Привязка сделана к СЕМЬЕ сессий, а не к строке: ротация помечает старую
 * строку `revokedAt` и создаёт новую, поэтому привязка к `RefreshSession.id`
 * убивала бы живой токен при каждом обновлении. Тест держит обе половины —
 * отзыв работает, а штатная ротация ничего не ломает.
 */

const spies = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));

const state = vi.hoisted(() => ({
  familyAlive: true,
  claimedFamilyId: "fam-1" as string | null,
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    refreshSession: {
      updateMany: (...a: unknown[]) => {
        spies.updateMany(...a);
        return Promise.resolve({ count: 1 });
      },
      findUnique: (...a: unknown[]) => {
        spies.findUnique(...a);
        return Promise.resolve({ familyId: state.claimedFamilyId });
      },
      create: (...a: unknown[]) => {
        spies.create(...a);
        return Promise.resolve({ id: "sess-2", jti: "jti-2" });
      },
      update: (...a: unknown[]) => {
        spies.update(...a);
        return Promise.resolve({});
      },
    },
    userProfile: {
      findFirst: () => Promise.resolve({ id: "u1", phone: "+79990000000", roles: ["CLIENT"] }),
    },
  };
  return {
    prisma: {
      $transaction: (fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx)),
      refreshSession: {
        create: (...a: unknown[]) => {
          spies.create(...a);
          return Promise.resolve({ id: "sess-1", jti: "jti-1" });
        },
      },
      userProfile: {
        findFirst: (args: { where: Record<string, unknown> }) => {
          spies.findFirst(args);
          // Семья считается живой, только если её строка не отозвана.
          const needsFamily = "refreshSessions" in args.where;
          if (needsFamily && !state.familyAlive) return Promise.resolve(null);
          return Promise.resolve({ id: "u1", roles: ["CLIENT"] });
        },
      },
    },
  };
});

vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieJar.get(name);
        return value ? { name, value } : undefined;
      },
    }),
}));
vi.mock("@/lib/env", () => ({
  env: {
    AUTH_JWT_SECRET: "test-jwt-secret-for-sec13",
    AUTH_COOKIE_NAME: "bh_session",
    NODE_ENV: "test",
  },
  isProduction: false,
}));

import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { getSessionUserFromRequest, rotateSessionCookies } from "@/lib/auth/session";
import { NextResponse } from "next/server";

function reqWithAccess(token: string): Request {
  return new Request("http://localhost/api/anything", {
    headers: { cookie: `bh_session=${token}` },
  });
}

beforeEach(() => {
  state.familyAlive = true;
  state.claimedFamilyId = "fam-1";
  spies.findFirst.mockClear();
  spies.create.mockClear();
  spies.findUnique.mockClear();
});

describe("SEC-13 · отзыв семьи выселяет держателя access-токена немедленно", () => {
  it("токен отозванной семьи больше не даёт пользователя", async () => {
    const token = signAccessToken({ sub: "u1", roles: ["CLIENT"], fid: "fam-1" });
    state.familyAlive = false;
    expect(await getSessionUserFromRequest(reqWithAccess(token))).toBeNull();
  });

  it("проверка семьи попадает в тот же единственный запрос", async () => {
    const token = signAccessToken({ sub: "u1", roles: ["CLIENT"], fid: "fam-1" });
    await getSessionUserFromRequest(reqWithAccess(token));
    expect(spies.findFirst).toHaveBeenCalledTimes(1);
    expect(spies.findFirst).toHaveBeenCalledWith({
      where: {
        id: "u1",
        isDeleted: false,
        refreshSessions: { some: { familyId: "fam-1", revokedAt: null } },
      },
    });
  });

  it("живая семья продолжает работать", async () => {
    const token = signAccessToken({ sub: "u1", roles: ["CLIENT"], fid: "fam-1" });
    expect(await getSessionUserFromRequest(reqWithAccess(token))).not.toBeNull();
  });
});

/**
 * Этот блок появился из-за живого смоука, а не из головы: первая версия фикса
 * патчила только `getSessionUser*`, а `/api/me` ходит через `getSessionUserId`,
 * который возвращал `payload.sub` ПРЯМО ИЗ ТОКЕНА, вообще не заглядывая в БД —
 * мимо проверки семьи и мимо проверки удаления аккаунта. Отозванное устройство
 * продолжало отвечать своим профилем.
 */
describe("SEC-13 · id-путь тоже проверяет сессию", () => {
  it("getSessionUserId спрашивает БД и семью, а не верит токену", async () => {
    const { getSessionUserId } = await import("@/lib/auth/session");
    const token = signAccessToken({ sub: "u1", roles: ["CLIENT"], fid: "fam-1" });
    cookieJar.set("bh_session", token);

    state.familyAlive = false;
    expect(await getSessionUserId()).toBeNull();

    state.familyAlive = true;
    expect(await getSessionUserId()).toBe("u1");
  });
});

describe("SEC-13 · совместимость: деплой не разлогинивает всех", () => {
  it("токен без fid (выпущен до SEC-13) продолжает работать", async () => {
    const legacy = signAccessToken({ sub: "u1", roles: ["CLIENT"] });
    state.familyAlive = false; // даже если чьи-то семьи отозваны
    const user = await getSessionUserFromRequest(reqWithAccess(legacy));
    expect(user).not.toBeNull();
    // Про семью такой токен не спрашивают вовсе.
    expect(spies.findFirst).toHaveBeenCalledWith({
      where: { id: "u1", isDeleted: false },
    });
  });
});

describe("SEC-13 · ротация не убивает живой токен", () => {
  it("новая строка наследует familyId предыдущей", async () => {
    const refresh = signRefreshToken({ sub: "u1", sid: "sess-1", jti: "jti-1" });
    await rotateSessionCookies(NextResponse.next(), refresh);

    const createArgs = spies.create.mock.calls.at(-1)?.[0] as { data: { familyId: string } };
    expect(createArgs.data.familyId).toBe("fam-1");
  });

  it("строка без семьи (до миграции) получает её со следующей ротации", async () => {
    state.claimedFamilyId = null;
    const refresh = signRefreshToken({ sub: "u1", sid: "sess-1", jti: "jti-1" });
    await rotateSessionCookies(NextResponse.next(), refresh);

    const createArgs = spies.create.mock.calls.at(-1)?.[0] as { data: { familyId: string } };
    expect(createArgs.data.familyId).toBe("sess-1");
  });
});
