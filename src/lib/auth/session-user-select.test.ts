import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-23 — `loadActiveSessionUser` читал строку `UserProfile` целиком
 * (`findFirst` без `select`), а зовут его `getSessionUser`/`getSessionUserId`
 * практически из каждого защищённого роута и из SSR публичных страниц. То
 * есть на каждый аутентифицированный запрос из БД ехали тридцать с лишним
 * колонок, включая адрес, ФИО и причину блокировки, — при том что сессии
 * нужны идентичность, роли и контакты.
 *
 * Пин держит две вещи:
 *   1. запрос идёт с `select` (иначе фикс снят);
 *   2. в наборе нет колонок, которых сессии заведомо не нужно, — то есть
 *      «вернуть всё через `select`» тоже не проходит.
 *
 * Полнота набора проверяется не здесь, а КОМПИЛЯТОРОМ: Prisma сужает тип
 * результата по `select`, поэтому потребитель, читающий поле не из списка,
 * валит `typecheck`. Тест поэтому и не перечисляет поля целиком — он
 * стережёт форму, а не список.
 */

const findFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { userProfile: { findFirst } },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    AUTH_JWT_SECRET: "test-jwt-secret-for-perf23",
    AUTH_COOKIE_NAME: "bh_session",
    NODE_ENV: "test",
  },
  isProduction: false,
}));

vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));

import { getSessionUserFromRequest } from "@/lib/auth/session";
import { signAccessToken } from "@/lib/auth/jwt";

/** Колонки, ради которых находка и заведена: сессии они не нужны никогда. */
const NEVER_NEEDED = [
  "address",
  "geoLat",
  "geoLng",
  "birthDate",
  "middleName",
  "blockedReason",
  "blockedByUserId",
  "hideAgeYear",
] as const;

function reqWithAccess(token: string): Request {
  return new Request("https://example.test/api/whatever", {
    headers: { cookie: `bh_session=${token}` },
  });
}

describe("PERF-23 · сессия читает сужённую строку профиля", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({ id: "u1", roles: ["CLIENT"] });
  });

  it("запрос идёт с `select`, а не за всей строкой", async () => {
    await getSessionUserFromRequest(reqWithAccess(signAccessToken({ sub: "u1", roles: ["CLIENT"] })));

    expect(findFirst).toHaveBeenCalledTimes(1);
    const args = findFirst.mock.calls[0][0] as { select?: Record<string, boolean> };
    expect(args.select).toBeTruthy();
    expect(Object.keys(args.select ?? {}).length).toBeGreaterThan(0);
  });

  it("в наборе нет колонок, которых сессии не нужно", async () => {
    await getSessionUserFromRequest(reqWithAccess(signAccessToken({ sub: "u1", roles: ["CLIENT"] })));

    const args = findFirst.mock.calls[0][0] as { select?: Record<string, boolean> };
    const selected = Object.keys(args.select ?? {});
    for (const column of NEVER_NEEDED) {
      expect(selected).not.toContain(column);
    }
  });

  it("идентичность и роли из набора не пропали", async () => {
    await getSessionUserFromRequest(reqWithAccess(signAccessToken({ sub: "u1", roles: ["CLIENT"] })));

    const args = findFirst.mock.calls[0][0] as { select?: Record<string, boolean> };
    const selected = Object.keys(args.select ?? {});
    expect(selected).toEqual(expect.arrayContaining(["id", "roles", "isDeleted"]));
  });
});
