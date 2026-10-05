import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B2 — `POST/DELETE /api/mobile/v1/devices`.
 *
 * Пиннится: вход обязателен и с семьёй сессии (без неё выход не отвязал бы
 * токен); установка и платформа — из заголовков приложения; провайдер должен
 * существовать на платформе; в строку уходит семья текущего входа; ответы —
 * `no-store`; токен не попадает в лог даже при сбое.
 */

const session = vi.hoisted(() => ({
  current: { user: { id: "u1" }, familyId: "fam-1" } as { user: { id: string }; familyId: string | null } | null,
}));
const registerPushDevice = vi.hoisted(() => vi.fn(async () => undefined));
const unregisterPushDevice = vi.hoisted(() => vi.fn(async () => undefined));
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn(async () => session.current) }));
vi.mock("@/lib/notifications/native-push/devices", () => ({ registerPushDevice, unregisterPushDevice }));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logError,
}));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));

import { DELETE, POST } from "@/app/api/mobile/v1/devices/route";

const INSTALLATION = "9b2f6c1e-7a4d-4c55-9f3e-2b8d1a6e0c11";
const FCM_TOKEN = "dGVzdA:APA91bHsecret-token_value";
const APNS_TOKEN = "ab".repeat(32);

function headers(overrides: Record<string, string | null> = {}): Record<string, string> {
  const base: Record<string, string | null> = {
    "content-type": "application/json",
    "x-installation-id": INSTALLATION,
    "x-client-platform": "android",
    "x-app-version": "1.2.0+15",
    ...overrides,
  };
  return Object.fromEntries(Object.entries(base).filter((entry): entry is [string, string] => entry[1] !== null));
}

function post(body: unknown, headerOverrides: Record<string, string | null> = {}) {
  return POST(
    new Request("http://localhost/api/mobile/v1/devices", {
      method: "POST",
      headers: headers(headerOverrides),
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function del(headerOverrides: Record<string, string | null> = {}) {
  return DELETE(new Request("http://localhost/api/mobile/v1/devices", { method: "DELETE", headers: headers(headerOverrides) }));
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.current = { user: { id: "u1" }, familyId: "fam-1" };
});

describe("POST /api/mobile/v1/devices", () => {
  it("регистрирует токен установки под семьёй текущего входа", async () => {
    const res = await post({ provider: "fcm", token: FCM_TOKEN });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, data: { registered: true } });
    expect(registerPushDevice).toHaveBeenCalledWith({
      userId: "u1",
      sessionFamilyId: "fam-1",
      installationId: INSTALLATION,
      provider: "FCM",
      token: FCM_TOKEN,
      apnsEnvironment: null,
      platform: "android",
      appVersion: "1.2.0+15",
    });
  });

  it("APNs: окружение из тела, по умолчанию production", async () => {
    await post({ provider: "apns", token: APNS_TOKEN, apnsEnvironment: "sandbox" }, { "x-client-platform": "ios" });
    expect(registerPushDevice).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "APNS", apnsEnvironment: "SANDBOX" }));
    await post({ provider: "apns", token: APNS_TOKEN }, { "x-client-platform": "ios" });
    expect(registerPushDevice).toHaveBeenLastCalledWith(expect.objectContaining({ apnsEnvironment: "PRODUCTION" }));
  });

  it("RuStore на Android, FCM на iOS — можно", async () => {
    expect((await post({ provider: "rustore", token: "rustore-token" })).status).toBe(200);
    expect((await post({ provider: "fcm", token: FCM_TOKEN }, { "x-client-platform": "ios" })).status).toBe(200);
  });

  it("без входа — 401", async () => {
    session.current = null;
    const res = await post({ provider: "fcm", token: FCM_TOKEN });
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("UNAUTHORIZED");
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it("токен без семьи сессии (до SEC-13) — 401: выход не смог бы его отвязать", async () => {
    session.current = { user: { id: "u1" }, familyId: null };
    expect((await post({ provider: "fcm", token: FCM_TOKEN })).status).toBe(401);
  });

  it.each([["x-installation-id"], ["x-client-platform"]])("без заголовка %s — 400", async (header) => {
    const res = await post({ provider: "fcm", token: FCM_TOKEN }, { [header]: null });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION_ERROR");
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it("неизвестная платформа и битый id установки — как отсутствующие", async () => {
    expect((await post({ provider: "fcm", token: FCM_TOKEN }, { "x-client-platform": "windows" })).status).toBe(400);
    expect((await post({ provider: "fcm", token: FCM_TOKEN }, { "x-installation-id": "bad id!" })).status).toBe(400);
  });

  it.each([
    [{ provider: "gcm", token: FCM_TOKEN }],
    [{ provider: "fcm" }],
    [{ provider: "fcm", token: "" }],
    [{ provider: "fcm", token: "x".repeat(1025) }],
    [{ provider: "fcm", token: "with space" }],
    [{ provider: "fcm", token: FCM_TOKEN, apnsEnvironment: "sandbox" }],
    ["not json"],
  ])("невалидное тело %j — 400", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION_ERROR");
  });

  it("APNs-токен не hex — 400", async () => {
    expect((await post({ provider: "apns", token: "not-hex" }, { "x-client-platform": "ios" })).status).toBe(400);
  });

  it("провайдер не той платформы — 400", async () => {
    expect((await post({ provider: "apns", token: APNS_TOKEN })).status).toBe(400);
    expect((await post({ provider: "rustore", token: "rustore-token" }, { "x-client-platform": "ios" })).status).toBe(400);
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it("сбой БД — 500 с русским текстом, токен не в логе", async () => {
    registerPushDevice.mockRejectedValueOnce(new Error("db down"));
    const res = await post({ provider: "fcm", token: FCM_TOKEN });
    expect(res.status).toBe(500);
    const error = await errorOf(res);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toMatch(/^Не удалось включить уведомления/);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(FCM_TOKEN);
  });
});

describe("DELETE /api/mobile/v1/devices", () => {
  it("отвязывает установку текущего пользователя; повтор — тот же 200 {}", async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await del();
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ ok: true, data: {} });
    }
    expect(unregisterPushDevice).toHaveBeenCalledWith("u1", INSTALLATION);
  });

  it("без входа — 401; без установки — 400", async () => {
    session.current = null;
    expect((await del()).status).toBe(401);
    session.current = { user: { id: "u1" }, familyId: "fam-1" };
    expect((await del({ "x-installation-id": null })).status).toBe(400);
    expect(unregisterPushDevice).not.toHaveBeenCalled();
  });
});
