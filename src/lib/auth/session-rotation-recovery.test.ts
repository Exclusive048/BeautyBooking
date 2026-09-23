import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * SESSION-LOSS-01 — «часто разлогинивает».
 *
 * Ротация одноразовая, новая кука едет к браузеру в ответе. Потерянный ответ
 * (оборванная сеть, свёрнутое приложение, проигранная гонка параллельных
 * запросов) оставлял браузер с использованным токеном, и прощалось это лишь
 * 20 секунд — дальше вылет на /login. Воспроизведено вживую
 * (`.qa/diagnostics/session-loss/lost-response.spec.ts`).
 *
 * Правило теперь: использованный токен, чей ПРЕЕМНИК не использован и жив, —
 * повторная выдача того же преемника. Отставание на два шага, отозванная
 * строка, отозванный или протухший преемник — отказ, как и раньше.
 *
 * @probe 2026-09-23 — в `rotateSessionCookies` ветка повторной выдачи
 * заменена прежней (окно 20 с по `usedAt`, только access-токен): красные
 * «токен, использованный давно…» и «…refresh-куку преемника». Условие
 * `usedAt: null` у преемника снято: красный «отставание на два шага — отказ».
 * Возвращено — зелёный.
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
};

const db = vi.hoisted(() => ({ rows: new Map<string, Row>() }));

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!(cond as Record<string, unknown>[]).some((branch) => matches(row, branch))) return false;
      continue;
    }
    const value = row[key as keyof Row];
    if (cond === null) {
      if (value !== null) return false;
    } else if (typeof cond === "object" && cond !== null && !(cond instanceof Date)) {
      const c = cond as { not?: unknown; gt?: Date; gte?: Date; in?: unknown[] };
      if (c.in && !c.in.includes(value)) return false;
      if ("not" in c && c.not === null && value === null) return false;
      if (c.gt && !(value instanceof Date && value > c.gt)) return false;
      if (c.gte && !(value instanceof Date && value >= c.gte)) return false;
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
    create: async ({ data }: { data: Omit<Row, "id" | "usedAt" | "revokedAt" | "rotatedToSessionId"> }) => {
      const id = `s${db.rows.size + 1}`;
      db.rows.set(id, { id, usedAt: null, revokedAt: null, rotatedToSessionId: null, ...data });
      return { id, jti: data.jti };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      Object.assign(db.rows.get(where.id)!, data);
      return {};
    },
  };
  const tx = {
    refreshSession,
    userProfile: { findFirst: async () => ({ id: "u1", phone: null, roles: ["CLIENT"] }) },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx), refreshSession } };
});
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "test-jwt-secret-session-loss", AUTH_COOKIE_NAME: "bh_session", NODE_ENV: "test" },
  isProduction: false,
}));

import { signRefreshToken, verifyToken } from "@/lib/auth/jwt";
import { revokeRefreshSessionByToken, rotateSessionCookies } from "@/lib/auth/session";

const FUTURE = new Date(Date.now() + 86_400_000);
const LONG_AGO = new Date(Date.now() - 3 * 3_600_000);

function row(id: string, patch: Partial<Row> = {}): Row {
  return {
    id,
    userId: "u1",
    jti: `jti-${id}`,
    familyId: "fam",
    usedAt: null,
    revokedAt: null,
    expiresAt: FUTURE,
    rotatedToSessionId: null,
    ...patch,
  };
}

function tokenFor(id: string): string {
  return signRefreshToken({ sub: "u1", sid: id, jti: `jti-${id}` });
}

function refreshSidIn(response: NextResponse): string | null {
  const value = response.cookies.get("bh_refresh")?.value;
  return value ? (verifyToken(value, "refresh")?.sid ?? null) : null;
}

beforeEach(() => {
  db.rows.clear();
});

describe("SESSION-LOSS-01 · потерянный ответ ротации", () => {
  it("токен, использованный давно, чей преемник не использован, — сессия жива", async () => {
    db.rows.set("a1", row("a1", { usedAt: LONG_AGO, rotatedToSessionId: "a2" }));
    db.rows.set("a2", row("a2"));
    const response = NextResponse.next();
    await expect(rotateSessionCookies(response, tokenFor("a1"))).resolves.not.toBeNull();
  });

  it("клиенту повторно выдаётся refresh-кука преемника, новая строка не заводится", async () => {
    db.rows.set("a1", row("a1", { usedAt: LONG_AGO, rotatedToSessionId: "a2" }));
    db.rows.set("a2", row("a2"));
    const response = NextResponse.next();
    await rotateSessionCookies(response, tokenFor("a1"));
    expect(refreshSidIn(response)).toBe("a2");
    expect(db.rows.size).toBe(2);
    expect(db.rows.get("a2")!.usedAt).toBeNull();
  });

  it("отставание на два шага (преемник уже использован) — отказ", async () => {
    db.rows.set("a1", row("a1", { usedAt: LONG_AGO, rotatedToSessionId: "a2" }));
    db.rows.set("a2", row("a2", { usedAt: LONG_AGO, rotatedToSessionId: "a3" }));
    db.rows.set("a3", row("a3"));
    await expect(rotateSessionCookies(NextResponse.next(), tokenFor("a1"))).resolves.toBeNull();
  });

  it("отозванный преемник (вышли из аккаунта) — отказ", async () => {
    db.rows.set("a1", row("a1", { usedAt: LONG_AGO, rotatedToSessionId: "a2" }));
    db.rows.set("a2", row("a2", { revokedAt: new Date() }));
    await expect(rotateSessionCookies(NextResponse.next(), tokenFor("a1"))).resolves.toBeNull();
  });

  it("отозванный предъявленный токен — отказ", async () => {
    db.rows.set("a1", row("a1", { usedAt: LONG_AGO, rotatedToSessionId: "a2", revokedAt: new Date() }));
    db.rows.set("a2", row("a2"));
    await expect(rotateSessionCookies(NextResponse.next(), tokenFor("a1"))).resolves.toBeNull();
  });

  /**
   * Контракт с `mergeRefreshedCookies` (proxy.ts): выданная кука — на корне, а
   * всякая другая `bh_refresh` в том же ответе — гашение ЧУЖОГО пути. Слияние
   * по одному имени принимало это гашение за гашение выданной, и обработчик
   * запроса, в котором прокси ротировал сессию, `bh_refresh` не видел вовсе.
   */
  it("ротация пишет bh_refresh на корень, прочие bh_refresh в ответе — только гашение чужого пути", async () => {
    db.rows.set("a1", row("a1"));
    const response = NextResponse.next();
    await rotateSessionCookies(response, tokenFor("a1"));
    const refreshCookies = response.headers.getSetCookie().filter((c) => c.startsWith("bh_refresh="));
    const issued = refreshCookies.filter((c) => /;\s*Path=\/(;|$)/i.test(c));
    expect(issued).toHaveLength(1);
    expect(issued[0]).not.toMatch(/Max-Age=0/i);
    for (const other of refreshCookies.filter((c) => !issued.includes(c))) {
      expect(other).toMatch(/^bh_refresh=;/);
      expect(other).toMatch(/Max-Age=0/i);
      expect(other).not.toMatch(/;\s*Path=\/(;|$)/i);
    }
  });

  it("обычная ротация не изменилась: неиспользованный токен даёт нового преемника", async () => {
    db.rows.set("a1", row("a1"));
    const response = NextResponse.next();
    await rotateSessionCookies(response, tokenFor("a1"));
    const sid = refreshSidIn(response);
    expect(sid).not.toBe("a1");
    expect(db.rows.get("a1")!.rotatedToSessionId).toBe(sid);
    expect(db.rows.get(sid!)!.familyId).toBe("fam");
  });
});

/**
 * Выход гасит всю семью. Ротация ставит предшественнику только `usedAt`, а
 * проверка access-токена принимает семью, пока в ней есть неотозванная строка:
 * отзыв одной цепочки вперёд оставлял украденный access-токен живым до двух
 * часов, а отставший токен — способным восстановить сессию (SESSION-LOSS-01).
 *
 * @probe 2026-09-23 — в `revokeRefreshSessionByToken` убрана ветка семьи
 * (только `id in chainIds`): красный «выход отзывает всю семью…». Второй
 * кейс держит и прежний отзыв цепочки вперёд — он пиннит свойство «выход
 * закрывает повторную выдачу», а не механизм. Возвращено — зелёный.
 */
describe("выход из аккаунта — отзыв семьи", () => {
  it("выход отзывает всю семью, включая использованных предшественников", async () => {
    db.rows.set("a1", row("a1", { usedAt: LONG_AGO, rotatedToSessionId: "a2" }));
    db.rows.set("a2", row("a2", { usedAt: LONG_AGO, rotatedToSessionId: "a3" }));
    db.rows.set("a3", row("a3"));
    db.rows.set("b1", row("b1", { familyId: "other-device" }));

    await expect(revokeRefreshSessionByToken(tokenFor("a3"))).resolves.toBe("REVOKED");

    for (const id of ["a1", "a2", "a3"]) expect(db.rows.get(id)!.revokedAt).not.toBeNull();
    expect(db.rows.get("b1")!.revokedAt).toBeNull();
  });

  it("после выхода отставший токен сессию не восстанавливает", async () => {
    db.rows.set("a1", row("a1", { usedAt: LONG_AGO, rotatedToSessionId: "a2" }));
    db.rows.set("a2", row("a2", { usedAt: LONG_AGO, rotatedToSessionId: "a3" }));
    db.rows.set("a3", row("a3"));

    await revokeRefreshSessionByToken(tokenFor("a3"));
    await expect(rotateSessionCookies(NextResponse.next(), tokenFor("a2"))).resolves.toBeNull();
  });
});
