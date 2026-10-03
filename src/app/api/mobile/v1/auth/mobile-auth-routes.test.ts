import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-AUTH-A — мобильные роуты входа/обновления/выхода.
 *
 * Что пиннится:
 *  · OTP-входы ведут себя как веб (общий `otp-login.ts`): те же отказы, тот же
 *    гейт согласий ДО сжигания кода, — но сессия уходит в ТЕЛЕ `{ tokens,
 *    user }`, без `Set-Cookie`, с `no-store`, с метаданными устройства;
 *  · веб-роут после выноса логики отдаёт прежнее `{ redirect }` + куки;
 *  · refresh: любой отказ ротации — 401 UNAUTHORIZED (клиент выходит);
 *  · logout идемпотентен: любой исход отзыва — `200 {}`.
 */

const state = vi.hoisted(() => ({
  otp: { id: "otp1" } as unknown,
  registration: false,
  phoneAuthEnabled: true,
  verifiedEmailProfile: null as unknown,
}));

const spies = vi.hoisted(() => ({
  issueSession: vi.fn(async () => ({
    accessToken: "access.jwt",
    accessTokenExpiresAt: new Date("2026-10-03T12:00:00.000Z"),
    refreshToken: "refresh.jwt",
    refreshTokenExpiresAt: new Date("2026-11-02T10:00:00.000Z"),
  })),
  rotateSession: vi.fn(async (): Promise<unknown> => null),
  revokeRefreshSessionByToken: vi.fn(async (): Promise<string> => "REVOKED"),
  setSessionCookies: vi.fn(async (response: { cookies: { set: (n: string, v: string) => void } }) => {
    response.cookies.set("bh_session", "web-access");
  }),
  otpUpdate: vi.fn(async () => ({})),
  resolveCabinetRedirect: vi.fn(async () => ({ target: "/cabinet" })),
  recordUserConsents: vi.fn(async () => undefined),
  getMeIdentityFromDb: vi.fn(async (id: string) => ({
    id,
    roles: ["CLIENT"],
    displayName: null,
    phone: "+79990000000",
    email: null,
    externalPhotoUrl: null,
    emailNotificationsEnabled: true,
    emailVerified: false,
    pushNotificationsEnabled: true,
    welcomePending: false,
  })),
}));

vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "x".repeat(64), AUTH_COOKIE_NAME: "bh_session" },
  isProduction: false,
  get isPhoneAuthEnabled() {
    return state.phoneAuthEnabled;
  },
}));
vi.mock("@/lib/auth/session", () => ({
  issueSession: spies.issueSession,
  rotateSession: spies.rotateSession,
  revokeRefreshSessionByToken: spies.revokeRefreshSessionByToken,
  setSessionCookies: spies.setSessionCookies,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpCode: { findFirst: vi.fn(async () => state.otp), update: spies.otpUpdate },
    userProfile: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/auth/otp", () => ({ hashOtpCode: () => "hash", normalizePhone: (v: string) => v }));
vi.mock("@/lib/auth/otp-rate-limit", () => ({
  checkOtpVerifyLock: vi.fn(async () => ({ ok: true })),
  clearOtpVerifyFailures: vi.fn(async () => undefined),
  registerOtpVerifyFailure: vi.fn(async () => ({ ok: true })),
  checkOtpEmailVerifyLock: vi.fn(async () => ({ ok: true })),
  clearOtpEmailVerifyFailures: vi.fn(async () => undefined),
  registerOtpEmailVerifyFailure: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/auth/phone-claim", () => ({
  PHONE_LOGIN_PROFILE_SELECT: {},
  classifyPhoneLoginTarget: vi.fn(async () => ({ kind: state.registration ? "NEW" : "OWNER" })),
  isPhoneLoginRegistration: () => state.registration,
}));
vi.mock("@/lib/auth/phone-login-profile", () => ({
  resolvePhoneLoginProfile: vi.fn(async () => ({ id: "u-phone", roles: ["CLIENT"], phone: "+79990000000" })),
}));
vi.mock("@/lib/auth/email-login-profile", () => ({
  resolveEmailLoginProfile: vi.fn(async () => ({ id: "u-email", roles: ["CLIENT"], phone: null })),
  findVerifiedEmailProfile: vi.fn(async () => state.verifiedEmailProfile),
}));
vi.mock("@/lib/auth/cabinet-redirect", () => ({ resolveCabinetRedirect: spies.resolveCabinetRedirect }));
vi.mock("@/lib/legal/consent", () => ({ recordUserConsents: spies.recordUserConsents }));
vi.mock("@/lib/billing/ensure-free-subscription", () => ({ ensureFreeSubscriptionsForRoles: vi.fn(async () => undefined) }));
vi.mock("@/lib/bookings/link-guest-bookings", () => ({ linkGuestBookingsToUserByPhone: vi.fn(async () => undefined) }));
vi.mock("@/lib/users/me", () => ({
  invalidateMeIdentityCache: vi.fn(async () => undefined),
  getMeIdentityFromDb: spies.getMeIdentityFromDb,
}));
vi.mock("@/lib/http/ip", () => ({ extractClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));

import { POST as mobilePhoneVerify } from "@/app/api/mobile/v1/auth/otp/verify/route";
import { POST as mobileEmailVerify } from "@/app/api/mobile/v1/auth/otp/email/verify/route";
import { POST as mobileRefresh } from "@/app/api/mobile/v1/auth/refresh/route";
import { POST as mobileLogout } from "@/app/api/mobile/v1/auth/logout/route";
import { POST as webPhoneVerify } from "@/app/api/auth/otp/verify/route";

const DEVICE_HEADERS = {
  "x-client-platform": "android",
  "x-app-version": "1.0.0+12",
  "x-device-name": "Pixel 8",
  "x-installation-id": "6f1c2c1e-1111-4a2b-9c3d-000000000001",
  "user-agent": "MasterRyadom/1.0.0 (Android 15; Pixel 8)",
};

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

const GRANTED = { terms: true, pdProcessing: true, marketing: false };

beforeEach(() => {
  vi.clearAllMocks();
  state.otp = { id: "otp1" };
  state.registration = false;
  state.phoneAuthEnabled = true;
  state.verifiedEmailProfile = null;
});

describe("POST /api/mobile/v1/auth/otp/verify", () => {
  it("успех: { tokens, user } в теле, без кук, no-store, мета устройства в сессии", async () => {
    const res = await mobilePhoneVerify(
      post("/api/mobile/v1/auth/otp/verify", { phone: "+79990000000", code: "1234" }, DEVICE_HEADERS),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        tokens: {
          accessToken: "access.jwt",
          accessTokenExpiresAt: "2026-10-03T12:00:00.000Z",
          refreshToken: "refresh.jwt",
          refreshTokenExpiresAt: "2026-11-02T10:00:00.000Z",
        },
        user: expect.objectContaining({ id: "u-phone", roles: ["CLIENT"] }),
      },
    });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(spies.setSessionCookies).not.toHaveBeenCalled();
    expect(spies.resolveCabinetRedirect).not.toHaveBeenCalled();
    expect(spies.issueSession).toHaveBeenCalledWith(
      { sub: "u-phone", phone: "+79990000000", roles: ["CLIENT"] },
      {
        clientType: "MOBILE",
        platform: "android",
        appVersion: "1.0.0+12",
        deviceName: "Pixel 8",
        installationId: "6f1c2c1e-1111-4a2b-9c3d-000000000001",
        userAgent: "MasterRyadom/1.0.0 (Android 15; Pixel 8)",
      },
    );
  });

  it("регистрация без согласий — 400 CONSENT_REQUIRED, код не сожжён, сессии нет", async () => {
    state.registration = true;
    const res = await mobilePhoneVerify(post("/api/mobile/v1/auth/otp/verify", { phone: "+79990000000", code: "1234" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CONSENT_REQUIRED");
    expect(spies.otpUpdate).not.toHaveBeenCalled();
    expect(spies.issueSession).not.toHaveBeenCalled();
  });

  it("регистрация с согласиями — согласия записаны с User-Agent приложения", async () => {
    state.registration = true;
    const res = await mobilePhoneVerify(
      post("/api/mobile/v1/auth/otp/verify", { phone: "+79990000000", code: "1234", consent: GRANTED }, DEVICE_HEADERS),
    );
    expect(res.status).toBe(200);
    expect(spies.recordUserConsents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-phone", flags: GRANTED, userAgent: DEVICE_HEADERS["user-agent"] }),
    );
  });

  it("неверный код — 401 CODE_NOT_FOUND", async () => {
    state.otp = null;
    const res = await mobilePhoneVerify(post("/api/mobile/v1/auth/otp/verify", { phone: "+79990000000", code: "0000" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("CODE_NOT_FOUND");
  });

  it("вход по телефону выключен — 503 SYSTEM_FEATURE_DISABLED до чтения тела", async () => {
    state.phoneAuthEnabled = false;
    const res = await mobilePhoneVerify(post("/api/mobile/v1/auth/otp/verify", { phone: "+79990000000", code: "1234" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("SYSTEM_FEATURE_DISABLED");
    expect(spies.issueSession).not.toHaveBeenCalled();
  });

  it("невалидное тело — 400 VALIDATION_ERROR", async () => {
    const res = await mobilePhoneVerify(post("/api/mobile/v1/auth/otp/verify", { phone: "123" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/mobile/v1/auth/otp/email/verify", () => {
  it("успех: { tokens, user }, без кук", async () => {
    state.verifiedEmailProfile = { id: "u-email" };
    const res = await mobileEmailVerify(
      post("/api/mobile/v1/auth/otp/email/verify", { email: "a@example.com", code: "1234" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tokens.refreshToken).toBe("refresh.jwt");
    expect(body.data.user.id).toBe("u-email");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("новый адрес без согласий — 400 CONSENT_REQUIRED", async () => {
    const res = await mobileEmailVerify(
      post("/api/mobile/v1/auth/otp/email/verify", { email: "new@example.com", code: "1234" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CONSENT_REQUIRED");
  });
});

describe("веб-роут после выноса логики — прежний контракт", () => {
  it("POST /api/auth/otp/verify: { redirect } + куки, без токенов в теле", async () => {
    const res = await webPhoneVerify(post("/api/auth/otp/verify", { phone: "+79990000000", code: "1234" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { redirect: "/cabinet" } });
    expect(spies.setSessionCookies).toHaveBeenCalledWith(expect.anything(), {
      sub: "u-phone",
      phone: "+79990000000",
      roles: ["CLIENT"],
    });
    expect(spies.issueSession).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie") ?? "").toContain("bh_session=web-access");
  });
});

describe("POST /api/mobile/v1/auth/refresh", () => {
  it("отказ ротации — 401 UNAUTHORIZED, no-store", async () => {
    spies.rotateSession.mockResolvedValueOnce(null);
    const res = await mobileRefresh(post("/api/mobile/v1/auth/refresh", { refreshToken: "stale" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("успех — новая пара; свежая мета устройства передана в ротацию", async () => {
    spies.rotateSession.mockResolvedValueOnce({
      payload: { sub: "u1" },
      reissued: false,
      tokens: {
        accessToken: "a2",
        accessTokenExpiresAt: new Date("2026-10-03T14:00:00.000Z"),
        refreshToken: "r2",
        refreshTokenExpiresAt: new Date("2026-11-02T12:00:00.000Z"),
      },
    });
    const res = await mobileRefresh(post("/api/mobile/v1/auth/refresh", { refreshToken: "r1" }, DEVICE_HEADERS));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      tokens: {
        accessToken: "a2",
        accessTokenExpiresAt: "2026-10-03T14:00:00.000Z",
        refreshToken: "r2",
        refreshTokenExpiresAt: "2026-11-02T12:00:00.000Z",
      },
    });
    expect(spies.rotateSession).toHaveBeenCalledWith("r1", {
      deviceMeta: expect.objectContaining({ appVersion: "1.0.0+12", platform: "android" }),
    });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("без refreshToken — 400 VALIDATION_ERROR, ротация не зовётся", async () => {
    const res = await mobileRefresh(post("/api/mobile/v1/auth/refresh", {}));
    expect(res.status).toBe(400);
    expect(spies.rotateSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/mobile/v1/auth/logout", () => {
  it.each(["REVOKED", "ALREADY_INACTIVE", "INVALID_TOKEN"])("исход %s — 200 {}", async (outcome) => {
    spies.revokeRefreshSessionByToken.mockResolvedValueOnce(outcome);
    const res = await mobileLogout(post("/api/mobile/v1/auth/logout", { refreshToken: "r1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: {} });
    expect(spies.revokeRefreshSessionByToken).toHaveBeenCalledWith("r1");
  });
});
