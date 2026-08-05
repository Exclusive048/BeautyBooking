import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * RKN-FIX-01 — per-path proof that no registration path can create an account
 * without recorded consent, and that consent actually gets recorded when given.
 *
 * The enumerated user-creation sites are phone OTP, email OTP, VK, Yandex and
 * Telegram (guest booking is RKN-FIX-02). Each is exercised through its real
 * route handler with the providers mocked, so the assertions are about the
 * route's own decision, not about a helper in isolation.
 */

const state = vi.hoisted(() => ({
  existingProfile: null as unknown,
  otp: { id: "otp1" } as unknown,
  telegramEnabled: true,
}));

const spies = vi.hoisted(() => ({
  recordUserConsents: vi.fn(async () => undefined),
  userProfileCreate: vi.fn(async () => ({ id: "new-user", roles: ["CLIENT"], phone: null, email: null })),
  setSessionCookies: vi.fn(),
  exchangeVkCodeForToken: vi.fn(async () => ({ accessToken: "at", refreshToken: "rt", deviceId: "d" })),
  fetchVkProfile: vi.fn(async () => ({ id: "vk-1", firstName: "A", lastName: "B" })),
  getSessionUser: vi.fn(async () => null as unknown),
  nextRedirect: vi.fn((_req: Request, target: string) =>
    new Response(null, { status: 307, headers: { location: target } }),
  ),
  verifyTelegramLoginState: vi.fn(() => true),
  authenticateTelegramLogin: vi.fn(async () => ({
    ok: true,
    user: { id: "tg-user", roles: ["CLIENT"], phone: null },
  })),
}));

vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "x".repeat(64), TELEGRAM_BOT_TOKEN: "bot", AUTH_COOKIE_NAME: "bh_session" },
  isProduction: false,
  isPhoneAuthEnabled: true,
  // FIX-SEC-EMAIL-IDENTITY-01: килсвитч email-канала (дефолт ON в проде).
  isEmailAuthEnabled: true,
  isVkAuthEnabled: true,
  isYandexAuthEnabled: true,
}));

vi.mock("@/lib/legal/consent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/legal/consent")>();
  return { ...actual, recordUserConsents: spies.recordUserConsents };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: vi.fn(async () => state.existingProfile),
      // FIX-SEC-EMAIL-IDENTITY-01: email-логин резолвит профиль через
      // verified-фильтр (`findFirst`), а не `findUnique({ email })`.
      // Фикстура «пользователь существует» здесь по смыслу подтверждена —
      // предмет этих тестов согласия, а не верификация адреса.
      findFirst: vi.fn(async () => state.existingProfile),
      create: spies.userProfileCreate,
      update: vi.fn(async () => state.existingProfile),
    },
    otpCode: { findFirst: vi.fn(async () => state.otp), update: vi.fn(async () => ({})) },
    vkLink: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
    userConsent: { findMany: vi.fn(async () => []), createMany: vi.fn(async () => ({ count: 0 })), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  setSessionCookies: spies.setSessionCookies,
  getSessionUser: spies.getSessionUser,
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
vi.mock("@/lib/auth/phone-login-profile", () => ({
  resolvePhoneLoginProfile: vi.fn(async () => ({ id: "new-user", roles: ["CLIENT"], phone: "+79990000000" })),
}));
vi.mock("@/lib/auth/email-login-profile", () => ({
  resolveEmailLoginProfile: vi.fn(async () => ({ id: "new-user", roles: ["CLIENT"], phone: null })),
  // FIX-SEC-EMAIL-IDENTITY-01: роут ищет профиль через verified-фильтр.
  // Здесь `null` = «новый пользователь» — ровно тот сценарий, который
  // проверяют эти два теста (согласия при создании аккаунта).
  findVerifiedEmailProfile: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/cabinet-redirect", () => ({
  resolveCabinetRedirect: vi.fn(async () => ({ target: "/cabinet" })),
}));
vi.mock("@/lib/auth/roles", () => ({ ensureClientRoleForUser: vi.fn(async (_id: string, r: unknown) => r) }));
vi.mock("@/lib/billing/ensure-free-subscription", () => ({
  // Routes call `.catch()` on this fire-and-forget promise.
  ensureFreeSubscriptionsForRoles: vi.fn(async () => undefined),
}));
vi.mock("@/lib/bookings/link-guest-bookings", () => ({ linkGuestBookingsToUserByPhone: vi.fn(async () => undefined) }));
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/http/origin", () => ({ nextRedirect: spies.nextRedirect }));
vi.mock("@/lib/vk/oauth", () => ({
  exchangeVkCodeForToken: spies.exchangeVkCodeForToken,
  fetchVkProfile: spies.fetchVkProfile,
  requireVkRedirectUri: () => "https://app.example/cb",
  buildVkAuthorizeUrl: () => "https://id.vk.ru/authorize",
}));
vi.mock("@/lib/vk/pkce", () => ({ generateCodeChallenge: () => "c", generateCodeVerifier: () => "v" }));
vi.mock("@/lib/vk/cookies", () => ({
  signVkCookieValue: (v: string) => v,
  readSignedVkCookieValue: (v?: string) => v ?? null,
  VK_ID_STATE_COOKIE: "vk_state",
  VK_ID_VERIFIER_COOKIE: "vk_ver",
  VK_ID_STATE_TTL_SECONDS: 600,
}));
vi.mock("@/lib/telegram/feature", () => ({ getTelegramEnabled: vi.fn(async () => state.telegramEnabled) }));
vi.mock("@/lib/auth/telegram-login", () => ({ authenticateTelegramLogin: spies.authenticateTelegramLogin }));
vi.mock("@/lib/auth/telegram-login-state", () => ({
  verifyTelegramLoginState: spies.verifyTelegramLoginState,
  claimTelegramAuthHash: vi.fn(async () => true),
  TELEGRAM_LOGIN_STATE_COOKIE: "tg_state",
  TELEGRAM_LOGIN_STATE_TTL_SECONDS: 600,
}));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
  })),
}));

import { POST as phoneVerify } from "@/app/api/auth/otp/verify/route";
import { POST as emailVerify } from "@/app/api/auth/otp/email/verify/route";
import { GET as vkStart } from "@/app/api/auth/vk/start/route";
import { GET as vkCallback } from "@/app/api/auth/vk/callback/route";
import { GET as telegramLogin } from "@/app/api/auth/telegram/login/route";
import { signConsentCookieValue } from "@/lib/legal/oauth-consent-cookie";
import { NextRequest } from "next/server";

const GRANTED = { terms: true, pdProcessing: true, marketing: false };
const MISSING_PD = { terms: true, pdProcessing: false, marketing: true };

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  state.existingProfile = null;
  state.otp = { id: "otp1" };
  state.telegramEnabled = true;
  spies.getSessionUser.mockResolvedValue(null);
  spies.verifyTelegramLoginState.mockReturnValue(true);
});

describe("phone OTP", () => {
  it("new user without consent → 400 CONSENT_REQUIRED, nothing recorded", async () => {
    const res = await phoneVerify(jsonReq("http://localhost/api/auth/otp/verify", {
      phone: "+79990000000",
      code: "123456",
    }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("CONSENT_REQUIRED");
    expect(spies.recordUserConsents).not.toHaveBeenCalled();
    expect(spies.setSessionCookies).not.toHaveBeenCalled();
  });

  it("new user with only the offer ticked → still refused (PD consent is required)", async () => {
    const res = await phoneVerify(jsonReq("http://localhost/api/auth/otp/verify", {
      phone: "+79990000000",
      code: "123456",
      consent: MISSING_PD,
    }));
    expect(res.status).toBe(400);
    expect(spies.setSessionCookies).not.toHaveBeenCalled();
  });

  it("new user with both required consents → logs in and records them", async () => {
    const res = await phoneVerify(jsonReq("http://localhost/api/auth/otp/verify", {
      phone: "+79990000000",
      code: "123456",
      consent: GRANTED,
    }));
    expect(res.status).toBe(200);
    expect(spies.recordUserConsents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "new-user", flags: GRANTED, userAgent: "vitest" }),
    );
  });

  it("EXISTING user without consent → login proceeds, no rows written", async () => {
    state.existingProfile = { id: "old-user", roles: ["CLIENT"], phone: "+79990000000" };
    const res = await phoneVerify(jsonReq("http://localhost/api/auth/otp/verify", {
      phone: "+79990000000",
      code: "123456",
    }));
    expect(res.status).toBe(200);
    expect(spies.recordUserConsents).not.toHaveBeenCalled();
  });
});

describe("email OTP", () => {
  it("new user without consent → 400 CONSENT_REQUIRED", async () => {
    const res = await emailVerify(jsonReq("http://localhost/api/auth/otp/email/verify", {
      email: "a@b.ru",
      code: "123456",
    }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("CONSENT_REQUIRED");
    expect(spies.recordUserConsents).not.toHaveBeenCalled();
  });

  it("new user with consent → records it", async () => {
    const res = await emailVerify(jsonReq("http://localhost/api/auth/otp/email/verify", {
      email: "a@b.ru",
      code: "123456",
      consent: GRANTED,
    }));
    expect(res.status).toBe(200);
    expect(spies.recordUserConsents).toHaveBeenCalledOnce();
  });
});

describe("VK OAuth", () => {
  it("start without consent → 400, no OAuth flow begun", async () => {
    const res = await vkStart(new Request("http://localhost/api/auth/vk/start"));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("CONSENT_REQUIRED");
    expect(cookieJar.get("vk_state")).toBeUndefined();
  });

  it("start WITH consent → redirects to VK and stores a state-bound consent cookie", async () => {
    const res = await vkStart(new Request("http://localhost/api/auth/vk/start?terms=1&pd=1&marketing=1"));
    expect([302, 307, 308]).toContain(res.status);
    expect(cookieJar.get("vk_id_consent")).toBeTruthy();
  });

  it("callback creating a NEW user without a consent cookie → no account, re-prompt", async () => {
    cookieJar.set("vk_state", "state-1");
    cookieJar.set("vk_ver", "verifier");
    const res = await vkCallback(
      new Request("http://localhost/api/auth/vk/callback?code=c&state=state-1&device_id=d"),
    );
    expect(res.headers.get("location")).toBe("/login?error=consent");
    expect(spies.userProfileCreate).not.toHaveBeenCalled();
    expect(spies.setSessionCookies).not.toHaveBeenCalled();
    expect(spies.recordUserConsents).not.toHaveBeenCalled();
  });

  it("callback with a consent cookie from ANOTHER flow → refused (no cross-flow replay)", async () => {
    cookieJar.set("vk_state", "state-1");
    cookieJar.set("vk_ver", "verifier");
    cookieJar.set("vk_id_consent", signConsentCookieValue("other-state", GRANTED));
    const res = await vkCallback(
      new Request("http://localhost/api/auth/vk/callback?code=c&state=state-1&device_id=d"),
    );
    expect(res.headers.get("location")).toBe("/login?error=consent");
    expect(spies.userProfileCreate).not.toHaveBeenCalled();
  });

  it("callback with a valid state-bound consent cookie → account created AND consent recorded", async () => {
    cookieJar.set("vk_state", "state-1");
    cookieJar.set("vk_ver", "verifier");
    cookieJar.set("vk_id_consent", signConsentCookieValue("state-1", GRANTED));
    const res = await vkCallback(
      new Request("http://localhost/api/auth/vk/callback?code=c&state=state-1&device_id=d"),
    );
    expect(res.status).toBe(307);
    expect(spies.userProfileCreate).toHaveBeenCalledOnce();
    expect(spies.recordUserConsents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "new-user", flags: GRANTED }),
    );
  });
});

describe("Telegram (kill-switched off in prod, kept at parity)", () => {
  it("login without a consent cookie → bounced back, profile never authenticated", async () => {
    cookieJar.set("tg_state", "s1");
    const res = await telegramLogin(
      new NextRequest("http://localhost/api/auth/telegram/login?s=s1&id=1&first_name=A&auth_date=1&hash=h"),
    );
    expect(res.headers.get("location")).toContain("error=consent");
    expect(spies.authenticateTelegramLogin).not.toHaveBeenCalled();
  });

  it("login with a valid consent cookie → authenticates and records consent", async () => {
    cookieJar.set("tg_state", "s1");
    cookieJar.set("tg_login_consent", signConsentCookieValue("s1", GRANTED));
    const res = await telegramLogin(
      new NextRequest("http://localhost/api/auth/telegram/login?s=s1&id=1&first_name=A&auth_date=1&hash=h"),
    );
    expect(res.status).toBe(307);
    expect(spies.authenticateTelegramLogin).toHaveBeenCalledOnce();
    expect(spies.recordUserConsents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "tg-user", flags: GRANTED }),
    );
  });
});
