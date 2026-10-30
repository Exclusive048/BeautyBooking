import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * USER-BLOCKING-01 — блокировка гасит сессию сразу и не даёт выпустить новую.
 *
 * Модель БД ниже честно исполняет `where` (в том числе `blockedAt: null` и
 * проверку семьи), поэтому тесты проверяют ПОВЕДЕНИЕ, а не форму запроса:
 * тот же access-токен до блокировки пускает, после — нет; и кукой, и Bearer.
 *
 * @probe 2026-10-30 — `blockedAt: null` убран из `loadActiveSessionUser`:
 *        красные «Bearer и кука теряют доступ…» (оба токена пускали после
 *        блокировки). Убран из `getSessionUserId` — красный «getSessionUserId…».
 *        Убрана проверка в `issueSession` — красный «issueSession отказывает…»
 *        (строка RefreshSession создавалась). Убран `blockedAt: null` из
 *        основной ветки `rotateSession` — красный «refresh-токен…»; из ветки
 *        повторной выдачи — красный «отставший на шаг…». Возвращено — зелёные.
 */

type User = { id: string; isDeleted: boolean; blockedAt: Date | null; phone: string | null; roles: string[] };
type Session = {
  id: string;
  userId: string;
  jti: string;
  familyId: string | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  rotatedToSessionId: string | null;
  clientType: "WEB" | "MOBILE";
  [key: string]: unknown;
};

const db = vi.hoisted(() => ({
  users: new Map<string, User>(),
  sessions: new Map<string, Session>(),
  headerJar: new Map<string, string>(),
}));

function matchesValue(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond === "object" && !(cond instanceof Date)) {
    const c = cond as { not?: unknown; gt?: Date };
    if ("not" in c && c.not === null && (value === null || value === undefined)) return false;
    if (c.gt && !(value instanceof Date && value > c.gt)) return false;
    return true;
  }
  return value === cond;
}

function matchesSession(row: Session, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => matchesValue(row[key], cond));
}

function matchesUser(user: User, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "refreshSessions") {
      const some = (cond as { some: Record<string, unknown> }).some;
      return [...db.sessions.values()].some((s) => s.userId === user.id && matchesSession(s, some));
    }
    return matchesValue(user[key as keyof User], cond);
  });
}

vi.mock("@/lib/prisma", () => {
  const userProfile = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...db.users.values()].find((u) => matchesUser(u, where)) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null,
  };
  const refreshSession = {
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Session> }) => {
      let count = 0;
      for (const row of db.sessions.values()) {
        if (matchesSession(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...db.sessions.values()].find((row) => matchesSession(row, where)) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) => db.sessions.get(where.id) ?? null,
    create: async ({ data }: { data: Partial<Session> & { userId: string; jti: string; expiresAt: Date } }) => {
      const id = `s${db.sessions.size + 1}`;
      db.sessions.set(id, {
        id,
        familyId: null,
        usedAt: null,
        revokedAt: null,
        rotatedToSessionId: null,
        clientType: "WEB",
        ...data,
      });
      return { id, jti: data.jti };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Session> }) => {
      Object.assign(db.sessions.get(where.id)!, data);
      return {};
    },
  };
  const client = { userProfile, refreshSession };
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => unknown) => fn(client) } };
});
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(Object.fromEntries(db.headerJar)),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "test-jwt-secret-account-block", AUTH_COOKIE_NAME: "bh_session", NODE_ENV: "test" },
  isProduction: false,
}));

import { verifyToken } from "@/lib/auth/jwt";
import { getSessionUserFromRequest, getSessionUserId, issueSession, rotateSession } from "@/lib/auth/session";

const USER_ID = "u-blocked";
const PAYLOAD = { sub: USER_ID, phone: "+79990000001", roles: ["CLIENT"] };

function block() {
  db.users.get(USER_ID)!.blockedAt = new Date("2026-10-30T10:00:00Z");
}

function bearerReq(token: string): Request {
  return new Request("https://app.test/api/me", { headers: { authorization: `Bearer ${token}` } });
}

function cookieReq(token: string): Request {
  return new Request("https://app.test/api/me", { headers: { cookie: `bh_session=${token}` } });
}

beforeEach(() => {
  db.users.clear();
  db.sessions.clear();
  db.headerJar.clear();
  db.users.set(USER_ID, { id: USER_ID, isDeleted: false, blockedAt: null, phone: PAYLOAD.phone, roles: ["CLIENT"] });
});

describe("уже выданный access-токен", () => {
  it("Bearer и кука теряют доступ в момент блокировки, не через два часа", async () => {
    const { accessToken } = await issueSession(PAYLOAD);
    expect((await getSessionUserFromRequest(bearerReq(accessToken)))?.id).toBe(USER_ID);
    expect((await getSessionUserFromRequest(cookieReq(accessToken)))?.id).toBe(USER_ID);

    block();
    // Семья НЕ отозвана — проверяется именно отметка блокировки, а не отзыв
    // сессий транзакцией блокировки (тот — второй слой).
    expect([...db.sessions.values()].every((s) => s.revokedAt === null)).toBe(true);
    expect(await getSessionUserFromRequest(bearerReq(accessToken))).toBeNull();
    expect(await getSessionUserFromRequest(cookieReq(accessToken))).toBeNull();
  });

  it("getSessionUserId (SSR и роуты через next/headers) тоже не пускает", async () => {
    const { accessToken } = await issueSession(PAYLOAD);
    db.headerJar.set("authorization", `Bearer ${accessToken}`);
    expect(await getSessionUserId()).toBe(USER_ID);
    block();
    expect(await getSessionUserId()).toBeNull();
  });

  it("разблокировка возвращает доступ живой семье (отметка — единственная причина отказа)", async () => {
    const { accessToken } = await issueSession(PAYLOAD);
    block();
    expect(await getSessionUserFromRequest(bearerReq(accessToken))).toBeNull();
    db.users.get(USER_ID)!.blockedAt = null;
    expect((await getSessionUserFromRequest(bearerReq(accessToken)))?.id).toBe(USER_ID);
  });
});

describe("выдача и ротация", () => {
  it("issueSession отказывает заблокированному и не создаёт строку сессии", async () => {
    block();
    await expect(issueSession(PAYLOAD)).rejects.toMatchObject({ status: 403, code: "ACCOUNT_BLOCKED" });
    expect(db.sessions.size).toBe(0);
  });

  it("refresh-токен заблокированного не даёт нового access, строка отзывается", async () => {
    const { refreshToken } = await issueSession(PAYLOAD);
    block();
    expect(await rotateSession(refreshToken)).toBeNull();
    const [row] = [...db.sessions.values()];
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(db.sessions.size).toBe(1);
  });

  it("отставший на шаг refresh-токен заблокированного не получает преемника повторно", async () => {
    const first = await issueSession(PAYLOAD);
    const rotated = await rotateSession(first.refreshToken);
    expect(rotated).not.toBeNull();
    expect(verifyToken(rotated!.tokens.accessToken, "access")?.sub).toBe(USER_ID);

    block();
    // Первый токен уже использован → ветка повторной выдачи (SESSION-LOSS-01).
    expect(await rotateSession(first.refreshToken)).toBeNull();
  });
});
