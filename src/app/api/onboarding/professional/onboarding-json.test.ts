import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B1 — онбординг мастера/студии для приложения: Bearer или
 * `Accept: application/json` получают конверт `ok()`/`fail()`, веб-форма — тот
 * же 303, что и раньше.
 *
 * Настоящие здесь оба обработчика, выбор ветки и конверт; подменены сессия,
 * создание кабинета и сборка редиректа (её origin берётся из env — не предмет
 * теста).
 *
 * @probe 2026-10-03 — `wantsJsonResponse` возвращал только Bearer-признак:
 *        красные три `Accept`-строки таблицы и «Accept: application/json без
 *        сессии — 401, а не редирект». Возвращено — зелёный.
 * @probe 2026-10-03 — в мастер-роуте JSON-ветка перенесена после
 *        `getSessionUser`/редиректа на `/login`: красный «протухший Bearer —
 *        401». Возвращено — зелёный.
 */

const state = vi.hoisted(() => ({
  user: null as { id: string; roles: string[] } | null,
  masterStatus: "created" as "created" | "already-exists",
  createError: null as Error | null,
}));
const spies = vi.hoisted(() => ({
  createMasterProfile: vi.fn(),
  createStudioProfile: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => state.user }));
vi.mock("@/lib/profiles/professional", () => ({
  createMasterProfile: async (input: unknown) => {
    spies.createMasterProfile(input);
    if (state.createError) throw state.createError;
    return { status: state.masterStatus, masterProfileId: "mp1", providerId: "prov1" };
  },
  createStudioProfile: async (input: unknown) => {
    spies.createStudioProfile(input);
    return { status: "created", studioId: "st1", providerId: "prov2" };
  },
}));
vi.mock("@/lib/http/origin", async () => {
  const { NextResponse } = await import("next/server");
  return {
    nextRedirect: (req: Request, path: string, status: number) =>
      NextResponse.redirect(new URL(path, req.url), status),
  };
});
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { POST as masterPOST } from "@/app/api/onboarding/professional/master/route";
import { POST as studioPOST } from "@/app/api/onboarding/professional/studio/route";
import { wantsJsonResponse } from "@/lib/profiles/onboarding-json";

const BROWSER_FORM_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8";

function post(handler: (req: Request) => Promise<Response>, path: string, headers: Record<string, string>) {
  return handler(new Request(`https://example.test${path}`, { method: "POST", headers }));
}
const master = (headers: Record<string, string>) => post(masterPOST, "/api/onboarding/professional/master", headers);
const studio = (headers: Record<string, string>) => post(studioPOST, "/api/onboarding/professional/studio", headers);

beforeEach(() => {
  state.user = { id: "u1", roles: ["CLIENT"] };
  state.masterStatus = "created";
  state.createError = null;
  spies.createMasterProfile.mockClear();
  spies.createStudioProfile.mockClear();
});

describe("wantsJsonResponse", () => {
  it.each([
    [{ authorization: "Bearer x.y.z" }, true],
    [{ accept: "application/json" }, true],
    [{ accept: "application/json, text/plain, */*" }, true],
    [{ accept: "text/plain, application/json;q=0.9" }, true],
    [{ accept: BROWSER_FORM_ACCEPT }, false],
    [{ accept: "*/*" }, false],
    [{ accept: "application/jsonp" }, false],
    [{ authorization: "Basic dTpw" }, false],
    [{}, false],
  ])("%j → %s", (headers, expected) => {
    expect(wantsJsonResponse(new Request("https://example.test/", { headers }))).toBe(expected);
  });
});

describe("веб-форма — прежний 303", () => {
  it("успех — в кабинет мастера, без тела-конверта", async () => {
    const res = await master({ accept: BROWSER_FORM_ACCEPT, cookie: "bh_session=x" });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/cabinet/master");
    expect(spies.createMasterProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", ensureFreeSubscriptionMode: "background" }),
    );
  });

  it("без сессии — на /login", async () => {
    state.user = null;
    const res = await studio({ accept: BROWSER_FORM_ACCEPT });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});

describe("приложение — конверт", () => {
  it("мастер: 200 { role, status, providerId, masterProfileId, next }", async () => {
    const res = await master({ authorization: "Bearer token" });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        role: "MASTER",
        status: "created",
        providerId: "prov1",
        masterProfileId: "mp1",
        next: "/cabinet/master",
      },
    });
    expect(spies.createMasterProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", ensureFreeSubscriptionMode: "background" }),
    );
  });

  it("повтор — 200 already-exists (идемпотентно)", async () => {
    state.masterStatus = "already-exists";
    const res = await master({ authorization: "Bearer token" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("already-exists");
  });

  it("студия: 200 { role: STUDIO, studioId, … }", async () => {
    const res = await studio({ authorization: "Bearer token" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { role: "STUDIO", status: "created", providerId: "prov2", studioId: "st1", next: "/cabinet/studio" },
    });
  });

  it("протухший Bearer — 401 UNAUTHORIZED (приложение сделает refresh), не редирект", async () => {
    state.user = null;
    const res = await master({ authorization: "Bearer expired" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(spies.createMasterProfile).not.toHaveBeenCalled();
  });

  it("Accept: application/json без сессии — 401, а не редирект", async () => {
    state.user = null;
    const res = await studio({ accept: "application/json" });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("сбой создания — 500 в конверте, а не голая страница ошибки", async () => {
    state.createError = new Error("db down");
    const res = await master({ authorization: "Bearer token" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error.code).toBe("string");
  });
});
