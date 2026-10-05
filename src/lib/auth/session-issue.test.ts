import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * MOBILE-AUTH-A — выдача и ротация сессии отделены от кук.
 *
 * `issueSession` / `rotateSession` возвращают пару токенов со сроками, а
 * `setSessionCookies` / `rotateSessionCookies` остались тонкими адаптерами —
 * веб обязан получать те же куки, что и до разделения. Мобильная сессия — та
 * же строка `RefreshSession` (та же семья SEC-13, та же ротация
 * SESSION-LOSS-01) плюс метаданные устройства, которые наследуются внутри
 * семьи и освежаются заголовками клиента; `lastUsedAt` ставится на выдаче и
 * на каждом refresh.
 */

type Row = {
  id: string;
  userId: string;
  jti: string;
  familyId: string | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  rotatedToSessionId: string | null;
  clientType: "WEB" | "MOBILE";
  platform: string | null;
  appVersion: string | null;
  deviceName: string | null;
  installationId: string | null;
  userAgent: string | null;
  lastUsedAt: Date | null;
};

const db = vi.hoisted(() => ({ rows: new Map<string, Row>(), createCalls: [] as Array<Record<string, unknown>> }));
const recordSurfaceEvent = vi.hoisted(() => vi.fn());

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key as keyof Row];
    if (cond === null) {
      if (value !== null) return false;
    } else if (typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { not?: unknown; gt?: Date };
      if ("not" in c && c.not === null && value === null) return false;
      if (c.gt && !(value instanceof Date && value > c.gt)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

vi.mock("@/lib/prisma", () => {
  const refreshSession = {
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      let count = 0;
      for (const row of db.rows.values()) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...db.rows.values()].find((row) => matches(row, where)) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) => db.rows.get(where.id) ?? null,
    create: async ({ data }: { data: Partial<Row> & { userId: string; jti: string; expiresAt: Date } }) => {
      db.createCalls.push(data as Record<string, unknown>);
      const id = `s${db.rows.size + 1}`;
      db.rows.set(id, {
        id,
        familyId: null,
        usedAt: null,
        revokedAt: null,
        rotatedToSessionId: null,
        clientType: "WEB",
        platform: null,
        appVersion: null,
        deviceName: null,
        installationId: null,
        userAgent: null,
        lastUsedAt: null,
        ...data,
      });
      return { id, jti: data.jti };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      Object.assign(db.rows.get(where.id)!, data);
      return {};
    },
  };
  const tx = {
    refreshSession,
    userProfile: { findFirst: async () => ({ id: "u1", phone: "+79990000000", roles: ["CLIENT"] }) },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx), refreshSession } };
});
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent }));
vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "test-jwt-secret-session-issue", AUTH_COOKIE_NAME: "bh_session", NODE_ENV: "test" },
  isProduction: false,
}));

import { verifyToken } from "@/lib/auth/jwt";
import { issueSession, rotateSession, rotateSessionCookies, setSessionCookies } from "@/lib/auth/session";

const PAYLOAD = { sub: "u1", phone: "+79990000000", roles: ["CLIENT"] };
const MOBILE_META = {
  clientType: "MOBILE" as const,
  platform: "ios",
  appVersion: "1.0.0+12",
  deviceName: "iPhone 15",
  installationId: "6f1c2c1e-1111-4a2b-9c3d-000000000001",
  userAgent: "MasterRyadom/1.0.0 (iOS 18.1; iPhone15,2)",
};

function onlyRow(): Row {
  expect(db.rows.size).toBe(1);
  return [...db.rows.values()][0];
}

beforeEach(() => {
  db.rows.clear();
  db.createCalls.length = 0;
  recordSurfaceEvent.mockClear();
});

describe("issueSession — пара токенов без транспорта", () => {
  it("сроки в ответе — ровно `exp` токенов; access несёт семью строки", async () => {
    const tokens = await issueSession(PAYLOAD, MOBILE_META);
    const access = verifyToken(tokens.accessToken, "access");
    const refresh = verifyToken(tokens.refreshToken, "refresh");
    expect(access?.fid).toBe(onlyRow().familyId);
    expect(tokens.accessTokenExpiresAt.getTime()).toBe(access!.exp * 1000);
    // refresh — не позже `exp` токена и не позже срока строки (они расходятся
    // не больше чем на секунду: строка считается в мс, `exp` — в секундах).
    expect(tokens.refreshTokenExpiresAt.getTime()).toBeLessThanOrEqual(refresh!.exp * 1000);
    expect(tokens.refreshTokenExpiresAt.getTime()).toBeLessThanOrEqual(onlyRow().expiresAt.getTime());
    expect(refresh!.exp * 1000 - tokens.refreshTokenExpiresAt.getTime()).toBeLessThan(1000);
    expect(refresh?.sid).toBe(onlyRow().id);
    // ~2 ч и ~30 дн — TTL из jwt.ts, без собственной арифметики.
    expect(tokens.accessTokenExpiresAt.getTime() - Date.now()).toBeGreaterThan(119 * 60 * 1000);
    expect(tokens.refreshTokenExpiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
  });

  it("мобильная строка получает мету устройства и lastUsedAt", async () => {
    await issueSession(PAYLOAD, MOBILE_META);
    const row = onlyRow();
    expect(row).toMatchObject({
      clientType: "MOBILE",
      platform: "ios",
      appVersion: "1.0.0+12",
      deviceName: "iPhone 15",
      installationId: MOBILE_META.installationId,
      userAgent: MOBILE_META.userAgent,
    });
    expect(row.lastUsedAt).toBeInstanceOf(Date);
    expect(recordSurfaceEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "mobile-session-issue" }));
  });

  it("веб-выдача (setSessionCookies): без меты, те же куки и метка телеметрии", async () => {
    const response = NextResponse.next();
    await setSessionCookies(response, PAYLOAD);

    expect(Object.keys(db.createCalls[0]).sort()).toEqual(
      ["expiresAt", "familyId", "jti", "lastUsedAt", "userId"].sort(),
    );
    const access = response.cookies.get("bh_session");
    const refresh = response.cookies.get("bh_refresh");
    expect(access).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 2 * 60 * 60 });
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    expect(verifyToken(access!.value, "access")?.fid).toBe(onlyRow().familyId);
    // Гашение куки со старым путём (SESSION-REFRESH-PATH-01) никуда не делось.
    expect(response.headers.get("set-cookie") ?? "").toContain("Path=/api/auth/refresh; Max-Age=0");
    expect(recordSurfaceEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "session-issue" }));
  });
});

describe("rotateSession — мета семьи и lastUsedAt", () => {
  it("новая строка наследует мету, свежие заголовки ложатся поверх", async () => {
    const issued = await issueSession(PAYLOAD, MOBILE_META);
    const rotated = await rotateSession(issued.refreshToken, {
      deviceMeta: { appVersion: "1.1.0+20", platform: null, deviceName: null, installationId: null, userAgent: null },
    });
    expect(rotated).not.toBeNull();

    const next = db.rows.get(verifyToken(rotated!.tokens.refreshToken, "refresh")!.sid!)!;
    const first = db.rows.get("s1")!;
    expect(next.id).not.toBe(first.id);
    expect(next.familyId).toBe(first.familyId);
    expect(next).toMatchObject({
      clientType: "MOBILE",
      platform: "ios",
      appVersion: "1.1.0+20",
      deviceName: "iPhone 15",
      installationId: MOBILE_META.installationId,
    });
    expect(next.lastUsedAt).toBeInstanceOf(Date);
    expect(recordSurfaceEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "mobile-refresh-rotate" }));
  });

  it("отставший на шаг токен: тот же преемник, lastUsedAt освежён, срок — строки преемника", async () => {
    const issued = await issueSession(PAYLOAD, MOBILE_META);
    const first = await rotateSession(issued.refreshToken);
    const successorId = verifyToken(first!.tokens.refreshToken, "refresh")!.sid!;
    const successor = db.rows.get(successorId)!;
    const shortExpiry = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    successor.expiresAt = shortExpiry;
    successor.lastUsedAt = new Date(0);

    const again = await rotateSession(issued.refreshToken);
    expect(again?.reissued).toBe(true);
    expect(verifyToken(again!.tokens.refreshToken, "refresh")?.sid).toBe(successorId);
    expect(db.rows.size).toBe(2);
    expect(successor.lastUsedAt.getTime()).toBeGreaterThan(0);
    expect(again!.tokens.refreshTokenExpiresAt.getTime()).toBe(shortExpiry.getTime());
  });

  it("веб-адаптер rotateSessionCookies ставит те же две куки", async () => {
    const response = NextResponse.next();
    await setSessionCookies(response, PAYLOAD);
    const refreshToken = response.cookies.get("bh_refresh")!.value;

    const next = NextResponse.next();
    const payload = await rotateSessionCookies(next, refreshToken);
    expect(payload).toEqual({ sub: "u1", phone: "+79990000000", roles: ["CLIENT"] });
    expect(next.cookies.get("bh_session")?.value).toBeTruthy();
    expect(verifyToken(next.cookies.get("bh_refresh")!.value, "refresh")?.sid).toBe("s2");
    expect(db.rows.get("s2")?.clientType).toBe("WEB");
    expect(recordSurfaceEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "refresh-rotate" }));
  });

  it("недействительный токен — null, строк не прибавляется", async () => {
    expect(await rotateSession("garbage")).toBeNull();
    expect(db.rows.size).toBe(0);
  });
});
