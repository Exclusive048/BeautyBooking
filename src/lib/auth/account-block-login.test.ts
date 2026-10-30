import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType } from "@prisma/client";

/**
 * USER-BLOCKING-01 — заблокированный не получает сессию ни одним путём входа,
 * и отказ не раскрывает блокировку тому, кто личность НЕ доказал.
 *
 *   - OTP телефона и почты: верный код → 403 `ACCOUNT_BLOCKED` с курируемым
 *     текстом, код НЕ сжигается, ничего не пишется; неверный код → обычный
 *     401 `CODE_NOT_FOUND` без чтения профиля (по номеру или адресу нельзя
 *     узнать, что аккаунт заблокирован);
 *   - телефон: регистрация поверх чужой неподтверждённой заявки
 *     (FOREIGN_CLAIM) заблокированным заявителем не закрывается — сессию
 *     получит свежий профиль, а не его;
 *   - VK / Яндекс: связка ведёт в заблокированный аккаунт → `account_blocked`
 *     до любой записи в профиль, связку и подписки;
 *   - Telegram: подпись верна → 403 `ACCOUNT_BLOCKED` до записи;
 *   - обмен кода приложения: заблокировали между колбэком и обменом → 403.
 *
 * Выдача сессии (`issueSession`) — страховка под всё это, её держит
 * `account-block-session.test.ts`.
 *
 * @probe 2026-10-30 — условия отказа выключены (`&& Date.now() < 0`) во всех
 *        пяти путях разом: красные ровно пять — «телефон: верный код…» (код
 *        сжигался, вход проходил), «почта: верный код…», «VK / Яндекс…»
 *        (обновлялся профиль), «Telegram…», «обмен кода: заблокировали…»
 *        (выдавалась сессия); каждый тест метит свой путь. Выключена ветка
 *        `isAccountBlockedError` в `catch` обмена — красный «…(гонка)…» (500).
 *        Чтение профиля по номеру поставлено ДО проверки кода — красный
 *        «телефон: неверный код…». Возвращено — зелёные.
 */

const BLOCKED_AT = new Date("2026-10-30T09:00:00Z");

const spies = vi.hoisted(() => ({
  otpFindFirst: vi.fn(),
  otpUpdate: vi.fn(async () => ({})),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  userCreate: vi.fn(),
  vkLinkFindUnique: vi.fn(),
  yandexLinkFindUnique: vi.fn(),
  registerPhoneFailure: vi.fn(async () => ({ ok: true }) as unknown),
  registerEmailFailure: vi.fn(async () => ({ ok: true }) as unknown),
  clearPhoneFailures: vi.fn(async () => undefined),
  clearEmailFailures: vi.fn(async () => undefined),
  findVerifiedEmailProfile: vi.fn(),
  resolveEmailLoginProfile: vi.fn(),
  resolvePhoneLoginProfile: vi.fn(),
  isGuestClassProfile: vi.fn(async () => false),
  recordUserConsents: vi.fn(async () => undefined),
  ensureFreeSubscriptions: vi.fn(async () => undefined),
  ensureClientRole: vi.fn(async (_id: string, roles: AccountType[]) => roles),
  verifyTelegram: vi.fn(() => true),
  takeMobileOAuthCode: vi.fn(),
  matchesPkce: vi.fn(() => true),
  respondWithMobileSession: vi.fn(async () => new Response("{}", { status: 200 })),
}));

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  env: { APP_REVIEW_LOGIN_EMAIL: undefined, APP_REVIEW_LOGIN_CODE: undefined },
  isPhoneAuthEnabled: true,
  isProduction: false,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpCode: { findFirst: spies.otpFindFirst, update: spies.otpUpdate },
    userProfile: {
      findUnique: spies.userFindUnique,
      findFirst: spies.userFindFirst,
      update: spies.userUpdate,
      create: spies.userCreate,
    },
    vkLink: { findUnique: spies.vkLinkFindUnique },
    yandexLink: { findUnique: spies.yandexLinkFindUnique },
  },
}));
vi.mock("@/lib/auth/otp-rate-limit", () => ({
  checkOtpVerifyLock: vi.fn(async () => ({ ok: true })),
  registerOtpVerifyFailure: spies.registerPhoneFailure,
  clearOtpVerifyFailures: spies.clearPhoneFailures,
  checkOtpEmailVerifyLock: vi.fn(async () => ({ ok: true })),
  registerOtpEmailVerifyFailure: spies.registerEmailFailure,
  clearOtpEmailVerifyFailures: spies.clearEmailFailures,
}));
vi.mock("@/lib/auth/email-login-profile", () => ({
  findVerifiedEmailProfile: spies.findVerifiedEmailProfile,
  resolveEmailLoginProfile: spies.resolveEmailLoginProfile,
}));
vi.mock("@/lib/auth/phone-login-profile", () => ({ resolvePhoneLoginProfile: spies.resolvePhoneLoginProfile }));
vi.mock("@/lib/auth/otp", () => ({ hashOtpCode: () => "hash", normalizePhone: (v: string) => v }));
vi.mock("@/lib/legal/consent", () => ({
  recordUserConsents: spies.recordUserConsents,
  isGuestClassProfile: spies.isGuestClassProfile,
}));
vi.mock("@/lib/http/ip", () => ({ extractClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/auth/cabinet-redirect", () => ({ resolveCabinetRedirect: vi.fn(async () => null) }));
vi.mock("@/lib/bookings/link-guest-bookings", () => ({ linkGuestBookingsToUserByPhone: vi.fn(async () => undefined) }));
vi.mock("@/lib/billing/ensure-free-subscription", () => ({ ensureFreeSubscriptionsForRoles: spies.ensureFreeSubscriptions }));
vi.mock("@/lib/auth/roles", () => ({ ensureClientRoleForUser: spies.ensureClientRole }));
vi.mock("@/lib/auth/phone-provider-proof", () => ({ applyProviderVerifiedPhoneSafe: vi.fn(async () => "none") }));
vi.mock("@/lib/auth/telegram", () => ({ verifyTelegramLogin: spies.verifyTelegram }));
vi.mock("@/lib/auth/mobile-oauth-store", () => ({ takeMobileOAuthCode: spies.takeMobileOAuthCode }));
vi.mock("@/lib/auth/mobile-oauth-flow", () => ({ matchesPkceS256Challenge: spies.matchesPkce }));
vi.mock("@/lib/auth/mobile-session", () => ({ respondWithMobileSession: spies.respondWithMobileSession }));
vi.mock("@/lib/api/with-request-context", () => ({
  withRequestContext: (_req: Request, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache: vi.fn() }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  withRequestId: (_id: string, fn: () => unknown) => fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { ACCOUNT_BLOCKED_MESSAGE } from "@/lib/auth/account-block";
import { resolveOAuthLogin, webOAuthLoginRefusalPath } from "@/lib/auth/oauth-login";
import { verifyEmailOtpLogin, verifyPhoneOtpLogin } from "@/lib/auth/otp-login";
import { authenticateTelegramLogin } from "@/lib/auth/telegram-login";
import { POST as exchangeMobileCode } from "@/app/api/mobile/v1/auth/oauth/exchange/route";

const PHONE = "+79990000001";
const EMAIL = "blocked@example.com";

function jsonReq(body: unknown): Request {
  return new Request("https://app.test/api/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readEnvelope(response: Response) {
  return (await response.json()) as { ok: boolean; error?: { message: string; code: string } };
}

function phoneProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-phone",
    phone: PHONE,
    phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    roles: [AccountType.CLIENT],
    blockedAt: BLOCKED_AT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  spies.otpFindFirst.mockResolvedValue({ id: "otp-1" });
  spies.registerPhoneFailure.mockResolvedValue({ ok: true });
  spies.registerEmailFailure.mockResolvedValue({ ok: true });
  spies.isGuestClassProfile.mockResolvedValue(false);
  spies.verifyTelegram.mockReturnValue(true);
  spies.matchesPkce.mockReturnValue(true);
});

describe("OTP телефона", () => {
  it("телефон: верный код — 403 ACCOUNT_BLOCKED, код не сжигается, ничего не пишется", async () => {
    spies.userFindUnique.mockResolvedValue(phoneProfile());

    const result = await verifyPhoneOtpLogin(jsonReq({ phone: PHONE, code: "123456" }), { resolveRedirect: false });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const body = await readEnvelope(result.response);
    expect(body.error).toEqual({ message: ACCOUNT_BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" });
    expect(spies.otpUpdate).not.toHaveBeenCalled();
    expect(spies.clearPhoneFailures).not.toHaveBeenCalled();
    expect(spies.resolvePhoneLoginProfile).not.toHaveBeenCalled();
    expect(spies.recordUserConsents).not.toHaveBeenCalled();
  });

  it("телефон: неверный код — обычный 401, профиль даже не читается", async () => {
    spies.otpFindFirst.mockResolvedValue(null);
    spies.userFindUnique.mockResolvedValue(phoneProfile());

    const result = await verifyPhoneOtpLogin(jsonReq({ phone: PHONE, code: "000000" }), { resolveRedirect: false });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect((await readEnvelope(result.response)).error?.code).toBe("CODE_NOT_FOUND");
    expect(spies.userFindUnique).not.toHaveBeenCalled();
    expect(spies.registerPhoneFailure).toHaveBeenCalledTimes(1);
  });

  it("телефон: заблокированный ЗАЯВИТЕЛЬ чужого номера не мешает владельцу зарегистрироваться", async () => {
    // Номер у заблокированного — неподтверждённая заявка (FOREIGN_CLAIM):
    // доказавший владение получает свежий профиль, а не вход в заявителя.
    spies.userFindUnique.mockResolvedValue(phoneProfile({ id: "u-squatter", phoneVerifiedAt: null }));
    spies.resolvePhoneLoginProfile.mockResolvedValue({ id: "u-owner", phone: PHONE, roles: [AccountType.CLIENT] });

    const result = await verifyPhoneOtpLogin(
      jsonReq({ phone: PHONE, code: "123456", consent: { terms: true, pdProcessing: true, marketing: false } }),
      { resolveRedirect: false },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.id).toBe("u-owner");
    expect(spies.otpUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("OTP почты", () => {
  it("почта: верный код — 403 ACCOUNT_BLOCKED, код не сжигается, профиль не создаётся", async () => {
    spies.findVerifiedEmailProfile.mockResolvedValue({
      id: "u-email",
      email: EMAIL,
      phone: null,
      roles: [AccountType.CLIENT],
      blockedAt: BLOCKED_AT,
    });

    const result = await verifyEmailOtpLogin(jsonReq({ email: EMAIL, code: "123456" }), { resolveRedirect: false });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect((await readEnvelope(result.response)).error).toEqual({
      message: ACCOUNT_BLOCKED_MESSAGE,
      code: "ACCOUNT_BLOCKED",
    });
    expect(spies.otpUpdate).not.toHaveBeenCalled();
    expect(spies.clearEmailFailures).not.toHaveBeenCalled();
    expect(spies.resolveEmailLoginProfile).not.toHaveBeenCalled();
  });

  it("почта: неверный код — обычный 401, профиль даже не читается", async () => {
    spies.otpFindFirst.mockResolvedValue(null);

    const result = await verifyEmailOtpLogin(jsonReq({ email: EMAIL, code: "000000" }), { resolveRedirect: false });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect((await readEnvelope(result.response)).error?.code).toBe("CODE_NOT_FOUND");
    expect(spies.findVerifiedEmailProfile).not.toHaveBeenCalled();
  });
});

describe("VK / Яндекс", () => {
  it("VK / Яндекс: связка ведёт в заблокированный аккаунт — отказ до любой записи", async () => {
    const blockedUser = {
      id: "u-oauth",
      firstName: null,
      lastName: null,
      displayName: null,
      email: null,
      externalPhotoUrl: null,
      roles: [AccountType.CLIENT],
      blockedAt: BLOCKED_AT,
    };
    spies.vkLinkFindUnique.mockResolvedValue({ userId: "u-oauth" });
    spies.yandexLinkFindUnique.mockResolvedValue({ userId: "u-oauth" });
    spies.userFindUnique.mockResolvedValue(blockedUser);

    const profile = { id: "p-1", firstName: "Анна", lastName: "Иванова", phone: null, email: "a@example.com", avatarUrl: "https://x.test/a.jpg" };
    const consent = { flags: { terms: true, pdProcessing: true, marketing: false }, ipAddress: null, userAgent: null };

    for (const identity of [
      { provider: "vk" as const, profile, deviceId: "dev" },
      { provider: "yandex" as const, profile },
    ]) {
      const resolution = await resolveOAuthLogin({ identity, consent });
      expect(resolution).toEqual({ ok: false, reason: "account_blocked" });
    }
    expect(spies.userUpdate).not.toHaveBeenCalled();
    expect(spies.userCreate).not.toHaveBeenCalled();
    expect(spies.ensureFreeSubscriptions).not.toHaveBeenCalled();
    expect(spies.recordUserConsents).not.toHaveBeenCalled();
    expect(webOAuthLoginRefusalPath("account_blocked")).toBe("/login?error=account_blocked");
    expect(webOAuthLoginRefusalPath("consent_required")).toBe("/login?error=consent");
  });
});

describe("Telegram", () => {
  it("Telegram: подпись верна, аккаунт заблокирован — 403 до записи", async () => {
    spies.userFindUnique.mockResolvedValue({ id: "u-tg", roles: [AccountType.CLIENT], blockedAt: BLOCKED_AT });

    const result = await authenticateTelegramLogin(
      { id: 42, first_name: "Анна", auth_date: Math.floor(Date.now() / 1000), hash: "sig" } as never,
      "bot-token",
    );

    expect(result).toEqual({ ok: false, status: 403, message: ACCOUNT_BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" });
    expect(spies.userUpdate).not.toHaveBeenCalled();
    expect(spies.userCreate).not.toHaveBeenCalled();
  });
});

describe("обмен кода приложения", () => {
  function exchangeReq() {
    return new Request("https://app.test/api/mobile/v1/auth/oauth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "c".repeat(43), codeVerifier: "v".repeat(43) }),
    });
  }

  it("обмен кода: заблокировали между колбэком и обменом — 403, сессия не выдаётся", async () => {
    spies.takeMobileOAuthCode.mockResolvedValue({ userId: "u-app", codeChallenge: "ch", provider: "vk" });
    spies.userFindFirst.mockResolvedValue({ id: "u-app", phone: null, roles: [AccountType.CLIENT], blockedAt: BLOCKED_AT });

    const response = await exchangeMobileCode(exchangeReq());

    expect(response.status).toBe(403);
    expect((await readEnvelope(response)).error).toEqual({ message: ACCOUNT_BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" });
    expect(spies.respondWithMobileSession).not.toHaveBeenCalled();
  });

  it("обмен кода: выдача сессии отказала блокировкой (гонка) — тот же 403, а не 500", async () => {
    spies.takeMobileOAuthCode.mockResolvedValue({ userId: "u-app", codeChallenge: "ch", provider: "vk" });
    spies.userFindFirst.mockResolvedValue({ id: "u-app", phone: null, roles: [AccountType.CLIENT], blockedAt: null });
    const { accountBlockedError } = await import("@/lib/auth/account-block");
    spies.respondWithMobileSession.mockRejectedValueOnce(accountBlockedError());

    const response = await exchangeMobileCode(exchangeReq());

    expect(response.status).toBe(403);
    expect((await readEnvelope(response)).error?.code).toBe("ACCOUNT_BLOCKED");
  });
});
