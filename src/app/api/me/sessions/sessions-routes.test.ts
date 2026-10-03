import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-AUTH-A3 — «Где я вошёл»: список семей сессий и их отзыв.
 *
 * Что пиннится:
 *  · единица списка — семья (SEC-13), а не строка ротации; legacy-строка без
 *    `familyId` и её преемники (`familyId = id` корня) — одна сессия;
 *  · `current` — семья предъявленного токена; порядок — по активности;
 *  · отзыв гасит ВСЕ строки семьи — то, на чём держится немедленная смерть
 *    access-токена (`loadActiveSessionUser`: семья жива, пока есть
 *    неотозванная строка; сам предикат пиннит `session-family-revocation.test.ts`);
 *  · чужая семья — 404 без различия «чья»; повтор своей — идемпотентный 200;
 *  · «завершить остальные» не трогает текущую и не теряет legacy-строки
 *    (`NULL <> x` в SQL — не истина);
 *  · MOBILE-B2: push-токены установок отозванных семей удаляются вместе с
 *    отзывом, токены текущей и чужих — нет.
 *
 * `prisma.refreshSession` — память с разбором ровно тех условий, что пишет
 * `session-families.ts`.
 */

type Row = {
  id: string;
  userId: string;
  familyId: string | null;
  clientType: "WEB" | "MOBILE";
  platform: string | null;
  deviceName: string | null;
  appVersion: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

type Device = { id: string; userId: string; sessionFamilyId: string };

const db = vi.hoisted(() => ({ rows: [] as Row[], devices: [] as Device[] }));
const session = vi.hoisted(() => ({ current: null as { user: { id: string }; familyId: string | null } | null }));

type Where = Record<string, unknown>;

function matchesValue(actual: unknown, condition: unknown): boolean {
  if (condition === null) return actual === null;
  if (condition instanceof Date) return actual instanceof Date && actual.getTime() === condition.getTime();
  if (typeof condition === "object") {
    const ops = condition as { not?: unknown; gt?: Date };
    // Семантика SQL, как у Prisma: `<>` и `>` с NULL — не истина.
    if ("not" in ops) return actual !== null && actual !== ops.not;
    if (ops.gt) return actual instanceof Date && actual > ops.gt;
    throw new Error(`unsupported condition ${JSON.stringify(condition)}`);
  }
  return actual === condition;
}

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Where[]).some((sub) => matches(row, sub));
    if (key === "AND") return (condition as Where[]).every((sub) => matches(row, sub));
    return matchesValue(row[key as keyof Row], condition);
  });
}

vi.mock("@/lib/prisma", () => {
  const refreshSession = {
    findMany: vi.fn(async ({ where, orderBy }: { where: Where; orderBy?: { createdAt: "desc" } }) => {
      const found = db.rows.filter((row) => matches(row, where));
      if (orderBy?.createdAt === "desc") found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return found.map((row) => ({ ...row }));
    }),
    findFirst: vi.fn(async ({ where }: { where: Where }) => db.rows.find((row) => matches(row, where)) ?? null),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: { revokedAt: Date } }) => {
      const hit = db.rows.filter((row) => matches(row, where));
      for (const row of hit) row.revokedAt = data.revokedAt;
      return { count: hit.length };
    }),
  };
  // MOBILE-B2: ровно те условия, что пишет `native-push/devices.ts`.
  type DeviceWhere = { userId: string; sessionFamilyId?: { in: string[] }; NOT?: { sessionFamilyId: string } };
  const deviceMatches = (device: Device, where: DeviceWhere) =>
    device.userId === where.userId &&
    (!where.sessionFamilyId || where.sessionFamilyId.in.includes(device.sessionFamilyId)) &&
    (!where.NOT || device.sessionFamilyId !== where.NOT.sessionFamilyId);
  const mobilePushDevice = {
    deleteMany: vi.fn(async ({ where }: { where: DeviceWhere }) => {
      const before = db.devices.length;
      db.devices = db.devices.filter((device) => !deviceMatches(device, where));
      return { count: before - db.devices.length };
    }),
  };
  const prisma = {
    refreshSession,
    mobilePushDevice,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ refreshSession, mobilePushDevice })),
  };
  return { prisma };
});
vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn(async () => session.current) }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));

import { GET as listSessions } from "@/app/api/me/sessions/route";
import { DELETE as revokeSession } from "@/app/api/me/sessions/[id]/route";
import { POST as revokeOthers } from "@/app/api/me/sessions/revoke-others/route";
import { summarizeUserAgent } from "@/lib/auth/session-families";

const NOW = Date.now();
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000);
const FUTURE = new Date(NOW + 30 * 24 * 3_600_000);

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function row(partial: Partial<Row> & Pick<Row, "id">): Row {
  return {
    userId: "u1",
    familyId: null,
    clientType: "WEB",
    platform: null,
    deviceName: null,
    appVersion: null,
    userAgent: null,
    createdAt: at(60),
    lastUsedAt: null,
    expiresAt: FUTURE,
    revokedAt: null,
    ...partial,
  };
}

function seed() {
  db.rows = [
    // Приложение: семья fam-app, две строки ротации — одна сессия.
    row({
      id: "r-app-1",
      familyId: "fam-app",
      clientType: "MOBILE",
      platform: "android",
      deviceName: "Pixel 8",
      appVersion: "1.0.0",
      createdAt: at(300),
      lastUsedAt: at(300),
    }),
    row({
      id: "r-app-2",
      familyId: "fam-app",
      clientType: "MOBILE",
      platform: "android",
      deviceName: "Pixel 8",
      appVersion: "1.0.1",
      createdAt: at(5),
      lastUsedAt: at(5),
    }),
    // Браузер — текущая сессия.
    row({ id: "r-web-1", familyId: "fam-web", userAgent: CHROME_WINDOWS, createdAt: at(120), lastUsedAt: at(30) }),
    // Legacy: корень без familyId и его преемник с familyId = id корня.
    row({ id: "legacy-root", familyId: null, createdAt: at(600), lastUsedAt: at(600) }),
    row({ id: "legacy-next", familyId: "legacy-root", createdAt: at(400), lastUsedAt: at(400) }),
    // Мёртвые: отозванная и истёкшая семьи, плюс чужая.
    row({ id: "r-revoked", familyId: "fam-revoked", revokedAt: at(10) }),
    row({ id: "r-expired", familyId: "fam-expired", expiresAt: at(1) }),
    row({ id: "r-foreign", familyId: "fam-foreign", userId: "u2" }),
  ];
  db.devices = [
    { id: "d-app", userId: "u1", sessionFamilyId: "fam-app" },
    { id: "d-web-fam", userId: "u1", sessionFamilyId: "fam-web" },
    { id: "d-foreign", userId: "u2", sessionFamilyId: "fam-foreign" },
  ];
}

const deviceIds = () => db.devices.map((device) => device.id).sort();

function deleteReq(id: string) {
  return revokeSession(new Request(`http://localhost/api/me/sessions/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

function liveRowsOf(familyKey: string) {
  return db.rows.filter((r) => (r.familyId ?? r.id) === familyKey && r.revokedAt === null);
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  session.current = { user: { id: "u1" }, familyId: "fam-web" };
});

describe("GET /api/me/sessions", () => {
  it("семьи, а не строки; свежие — первыми; current — семья токена", async () => {
    const res = await listSessions(new Request("http://localhost/api/me/sessions"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { sessions } = ((await res.json()) as { data: { sessions: Array<Record<string, unknown>> } }).data;

    expect(sessions.map((s) => s.id)).toEqual(["fam-app", "fam-web", "legacy-root"]);
    expect(sessions[0]).toMatchObject({
      clientType: "MOBILE",
      platform: "android",
      deviceName: "Pixel 8",
      appVersion: "1.0.1", // мета — с самой свежей строки
      browser: null,
      createdAt: at(300).toISOString(), // начало — с самой ранней
      lastUsedAt: at(5).toISOString(),
      current: false,
    });
    expect(sessions[1]).toMatchObject({ clientType: "WEB", browser: "Chrome, Windows", current: true });
    // Сырой User-Agent наружу не уходит.
    expect(JSON.stringify(sessions)).not.toContain("Mozilla");
  });

  it("без сессии → 401", async () => {
    session.current = null;
    const res = await listSessions(new Request("http://localhost/api/me/sessions"));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/me/sessions/{id}", () => {
  it("гасит ВСЕ строки семьи — access-токены этой семьи перестают проходить сразу", async () => {
    const res = await deleteReq("fam-app");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({});
    expect(liveRowsOf("fam-app")).toHaveLength(0);
    expect(liveRowsOf("fam-web")).toHaveLength(1);
  });

  it("MOBILE-B2: push-токены установки отозванной семьи удаляются, остальные — нет", async () => {
    await deleteReq("fam-app");
    expect(deviceIds()).toEqual(["d-foreign", "d-web-fam"]);
  });

  it("MOBILE-B2: чужая семья — 404 и чужие push-токены не тронуты", async () => {
    await deleteReq("fam-foreign");
    expect(deviceIds()).toEqual(["d-app", "d-foreign", "d-web-fam"]);
  });

  it("legacy-семья гасится вместе с преемниками", async () => {
    await deleteReq("legacy-root");
    expect(liveRowsOf("legacy-root")).toHaveLength(0);
  });

  it("идемпотентно: повтор своей завершённой — тот же 200", async () => {
    expect((await deleteReq("fam-revoked")).status).toBe(200);
    await deleteReq("fam-app");
    expect((await deleteReq("fam-app")).status).toBe(200);
  });

  it("можно завершить текущую", async () => {
    expect((await deleteReq("fam-web")).status).toBe(200);
    expect(liveRowsOf("fam-web")).toHaveLength(0);
  });

  it("чужая или выдуманная — 404 SESSION_NOT_FOUND, чужая не тронута", async () => {
    for (const id of ["fam-foreign", "nope", "bad id!"]) {
      const res = await deleteReq(id);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SESSION_NOT_FOUND");
    }
    expect(liveRowsOf("fam-foreign")).toHaveLength(1);
  });

  it("id отдельной строки ротации (не ключ семьи) — 404, а не отзыв обрывка", async () => {
    const res = await deleteReq("r-app-2");
    expect(res.status).toBe(404);
    expect(liveRowsOf("fam-app")).toHaveLength(2);
  });
});

describe("POST /api/me/sessions/revoke-others", () => {
  it("гасит все семьи, кроме текущей, включая legacy; revoked — число активных семей", async () => {
    const res = await revokeOthers(new Request("http://localhost/api/me/sessions/revoke-others", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { revoked: number } }).data.revoked).toBe(2);

    expect(liveRowsOf("fam-web")).toHaveLength(1);
    expect(liveRowsOf("fam-app")).toHaveLength(0);
    expect(liveRowsOf("legacy-root")).toHaveLength(0);
    expect(liveRowsOf("fam-foreign")).toHaveLength(1);
  });

  it("MOBILE-B2: push-токены всех установок, кроме текущей, удалены; чужие — нет", async () => {
    await revokeOthers(new Request("http://localhost/api/me/sessions/revoke-others", { method: "POST" }));
    expect(deviceIds()).toEqual(["d-foreign", "d-web-fam"]);
  });

  it("MOBILE-B2: токен без `fid` своей семьи не называет — удаляются все свои push-токены", async () => {
    session.current = { user: { id: "u1" }, familyId: null };
    await revokeOthers(new Request("http://localhost/api/me/sessions/revoke-others", { method: "POST" }));
    expect(deviceIds()).toEqual(["d-foreign"]);
  });

  it("текущая — legacy-семья: её корень без familyId не задет", async () => {
    session.current = { user: { id: "u1" }, familyId: "legacy-root" };
    await revokeOthers(new Request("http://localhost/api/me/sessions/revoke-others", { method: "POST" }));
    expect(liveRowsOf("legacy-root")).toHaveLength(2);
    expect(liveRowsOf("fam-web")).toHaveLength(0);
  });

  it("без сессии → 401", async () => {
    session.current = null;
    const res = await revokeOthers(new Request("http://localhost/api/me/sessions/revoke-others", { method: "POST" }));
    expect(res.status).toBe(401);
  });
});

describe("summarizeUserAgent", () => {
  it.each([
    [CHROME_WINDOWS, "Chrome, Windows"],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 YaBrowser/24.10.0.0 Safari/537.36",
      "Яндекс Браузер, Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      "Edge, Windows",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari, iOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      "Chrome, Android",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
      "Samsung Internet, Android",
    ],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox, macOS"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0", "Opera, Linux"],
    ["curl/8.5.0", null],
  ])("%s → %s", (userAgent, expected) => {
    expect(summarizeUserAgent(userAgent)).toBe(expected);
  });

  it("пусто → null", () => {
    expect(summarizeUserAgent(null)).toBeNull();
    expect(summarizeUserAgent("")).toBeNull();
  });
});
