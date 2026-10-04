import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — вход для App Review (`APP_REVIEW_LOGIN_EMAIL` +
 * `APP_REVIEW_LOGIN_CODE`).
 *
 *   - выключен, пока не заданы оба значения и оба верны;
 *   - касается ровно одного адреса: остальные входят как раньше;
 *   - запрос кода для этого адреса не пишет код и не шлёт письмо, но лимит
 *     запроса действует; вход принимает только постоянный код, неверный —
 *     обычный отказ со счётчиком неверных попыток, блокировка действует;
 *   - строка аудита — без адреса и кода.
 *
 * @probe  в `verifyEmailOtpLogin` заменить `appReview ? null : findFirst` на
 *         `findFirst` и `!otp && !appReviewCodeOk` на `!otp` → красный
 *         «верный постоянный код — вход без кода в базе».
 */

const state = vi.hoisted(() => ({
  env: {
    APP_REVIEW_LOGIN_EMAIL: undefined as string | undefined,
    APP_REVIEW_LOGIN_CODE: undefined as string | undefined,
  },
}));

const spies = vi.hoisted(() => ({
  otpCreate: vi.fn(async () => ({})),
  otpFindFirst: vi.fn(async () => null as unknown),
  otpUpdate: vi.fn(async () => ({})),
  sendEmail: vi.fn(async () => true),
  checkRequestLimit: vi.fn(async () => ({ ok: true }) as unknown),
  checkVerifyLock: vi.fn(async () => ({ ok: true }) as unknown),
  registerVerifyFailure: vi.fn(async () => ({ ok: true }) as unknown),
  clearVerifyFailures: vi.fn(async () => undefined),
  findVerifiedEmailProfile: vi.fn(async () => ({ id: "review-user", roles: ["CLIENT"], phone: null }) as unknown),
  resolveEmailLoginProfile: vi.fn(async () => ({ id: "review-user", roles: ["CLIENT"], phone: null })),
  logInfo: vi.fn(),
}));

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  env: state.env,
  isProduction: false,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpCode: { create: spies.otpCreate, findFirst: spies.otpFindFirst, update: spies.otpUpdate },
  },
}));
vi.mock("@/lib/email/sender", () => ({ isEmailConfigured: () => true, sendEmail: spies.sendEmail }));
vi.mock("@/lib/auth/otp-rate-limit", () => ({
  checkOtpEmailRequestRateLimit: spies.checkRequestLimit,
  checkOtpEmailVerifyLock: spies.checkVerifyLock,
  registerOtpEmailVerifyFailure: spies.registerVerifyFailure,
  clearOtpEmailVerifyFailures: spies.clearVerifyFailures,
  checkOtpVerifyLock: vi.fn(),
  clearOtpVerifyFailures: vi.fn(),
  registerOtpVerifyFailure: vi.fn(),
}));
vi.mock("@/lib/auth/email-login-profile", () => ({
  findVerifiedEmailProfile: spies.findVerifiedEmailProfile,
  resolveEmailLoginProfile: spies.resolveEmailLoginProfile,
}));
vi.mock("@/lib/http/proxy-trust", () => ({ observeAuthClientIp: vi.fn() }));
vi.mock("@/lib/auth/otp", () => ({
  hashOtpCode: () => "hash",
  generateOtpCode: () => "123456",
  normalizePhone: (v: string) => v,
}));
vi.mock("@/lib/legal/consent", () => ({ recordUserConsents: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/cabinet-redirect", () => ({ resolveCabinetRedirect: vi.fn(async () => null) }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn(), alertOtpRateLimitTriggered: vi.fn() }));
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache: vi.fn() }));
vi.mock("@/lib/billing/ensure-free-subscription", () => ({ ensureFreeSubscriptionsForRoles: vi.fn(async () => undefined) }));
vi.mock("@/lib/bookings/link-guest-bookings", () => ({ linkGuestBookingsToUserByPhone: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/phone-login-profile", () => ({ resolvePhoneLoginProfile: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  withRequestId: (_id: string, fn: () => unknown) => fn(),
  logInfo: spies.logInfo,
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { envSchemaForTests } from "@/lib/env";
import {
  isAppReviewLoginEmail,
  matchesAppReviewLoginCode,
  readAppReviewLoginConfig,
} from "@/lib/auth/app-review-login";
import { verifyEmailOtpLogin } from "@/lib/auth/otp-login";
import { POST as requestEmailCode } from "@/app/api/auth/otp/email/request/route";

const REVIEW_EMAIL = "review@masterryadom.ru";
const REVIEW_CODE = "482913";

function enable() {
  state.env.APP_REVIEW_LOGIN_EMAIL = " Review@MasterRyadom.ru ";
  state.env.APP_REVIEW_LOGIN_CODE = REVIEW_CODE;
}

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function verify(email: string, code: string) {
  return verifyEmailOtpLogin(jsonReq("https://app.test/api/auth/otp/email/verify", { email, code }), {
    resolveRedirect: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.env.APP_REVIEW_LOGIN_EMAIL = undefined;
  state.env.APP_REVIEW_LOGIN_CODE = undefined;
  spies.otpFindFirst.mockResolvedValue(null);
  spies.checkRequestLimit.mockResolvedValue({ ok: true });
  spies.checkVerifyLock.mockResolvedValue({ ok: true });
  spies.registerVerifyFailure.mockResolvedValue({ ok: true });
});

describe("настройка", () => {
  it("выключено без значений, с одним значением и с неверным форматом", () => {
    expect(readAppReviewLoginConfig({})).toBeNull();
    expect(readAppReviewLoginConfig({ APP_REVIEW_LOGIN_EMAIL: REVIEW_EMAIL })).toBeNull();
    expect(readAppReviewLoginConfig({ APP_REVIEW_LOGIN_CODE: REVIEW_CODE })).toBeNull();
    expect(readAppReviewLoginConfig({ APP_REVIEW_LOGIN_EMAIL: "not-an-email", APP_REVIEW_LOGIN_CODE: REVIEW_CODE })).toBeNull();
    expect(readAppReviewLoginConfig({ APP_REVIEW_LOGIN_EMAIL: REVIEW_EMAIL, APP_REVIEW_LOGIN_CODE: "12345" })).toBeNull();
    expect(readAppReviewLoginConfig({ APP_REVIEW_LOGIN_EMAIL: REVIEW_EMAIL, APP_REVIEW_LOGIN_CODE: "12a456" })).toBeNull();
  });

  it("оба верны — включено, адрес в нижнем регистре", () => {
    expect(
      readAppReviewLoginConfig({ APP_REVIEW_LOGIN_EMAIL: " Review@MasterRyadom.ru ", APP_REVIEW_LOGIN_CODE: ` ${REVIEW_CODE} ` }),
    ).toEqual({ email: REVIEW_EMAIL, code: REVIEW_CODE });
  });

  it("только этот адрес и только этот код", () => {
    const config = { email: REVIEW_EMAIL, code: REVIEW_CODE };
    expect(isAppReviewLoginEmail(REVIEW_EMAIL, config)).toBe(true);
    expect(isAppReviewLoginEmail("someone@masterryadom.ru", config)).toBe(false);
    expect(matchesAppReviewLoginCode(REVIEW_EMAIL, REVIEW_CODE, config)).toBe(true);
    expect(matchesAppReviewLoginCode(REVIEW_EMAIL, "000000", config)).toBe(false);
    expect(matchesAppReviewLoginCode("someone@masterryadom.ru", REVIEW_CODE, config)).toBe(false);
    expect(matchesAppReviewLoginCode(REVIEW_EMAIL, REVIEW_CODE, null)).toBe(false);
  });

  it("схема env: оба значения вместе, код — 6 цифр, адрес — почта", () => {
    const base = {
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      AUTH_JWT_SECRET: "x".repeat(32),
      OTP_HMAC_SECRET: "y".repeat(16),
    };
    const messages = (extra: Record<string, string>) => {
      const parsed = envSchemaForTests.safeParse({ ...base, ...extra });
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    };
    const pair = /must be set together/;
    expect(messages({}).some((m) => pair.test(m))).toBe(false);
    expect(messages({ APP_REVIEW_LOGIN_EMAIL: REVIEW_EMAIL, APP_REVIEW_LOGIN_CODE: REVIEW_CODE }).some((m) => pair.test(m) || /6 digits|email/.test(m))).toBe(false);
    expect(messages({ APP_REVIEW_LOGIN_EMAIL: REVIEW_EMAIL }).some((m) => pair.test(m))).toBe(true);
    expect(messages({ APP_REVIEW_LOGIN_EMAIL: REVIEW_EMAIL, APP_REVIEW_LOGIN_CODE: "1234" })).toContain("must be exactly 6 digits");
    expect(messages({ APP_REVIEW_LOGIN_EMAIL: "review", APP_REVIEW_LOGIN_CODE: REVIEW_CODE })).toContain("must be an email address");
  });
});

describe("запрос кода", () => {
  it("адрес App Review: 200 {}, кода в базе нет, письма нет, строка аудита без адреса", async () => {
    enable();
    const res = await requestEmailCode(jsonReq("https://app.test/api/auth/otp/email/request", { email: "REVIEW@masterryadom.ru" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: {} });
    expect(spies.otpCreate).not.toHaveBeenCalled();
    expect(spies.sendEmail).not.toHaveBeenCalled();
    expect(spies.logInfo).toHaveBeenCalledWith("auth.app-review-login", { stage: "request", outcome: "accepted" });
    expect(JSON.stringify(spies.logInfo.mock.calls)).not.toContain("review@");
  });

  it("лимит запроса действует и для адреса App Review", async () => {
    enable();
    spies.checkRequestLimit.mockResolvedValue({ ok: false, status: 429, error: "RATE_LIMIT", retryAfterSec: 60 });
    const res = await requestEmailCode(jsonReq("https://app.test/api/auth/otp/email/request", { email: REVIEW_EMAIL }));
    expect(res.status).toBe(429);
    expect(spies.logInfo).not.toHaveBeenCalledWith("auth.app-review-login", expect.anything());
  });

  it("другой адрес — обычный код и письмо", async () => {
    enable();
    const res = await requestEmailCode(jsonReq("https://app.test/api/auth/otp/email/request", { email: "client@example.com" }));
    expect(res.status).toBe(200);
    expect(spies.otpCreate).toHaveBeenCalled();
    expect(spies.sendEmail).toHaveBeenCalled();
  });

  it("выключено — адрес App Review получает обычное письмо", async () => {
    const res = await requestEmailCode(jsonReq("https://app.test/api/auth/otp/email/request", { email: REVIEW_EMAIL }));
    expect(res.status).toBe(200);
    expect(spies.sendEmail).toHaveBeenCalled();
  });
});

describe("вход", () => {
  it("верный постоянный код — вход без кода в базе", async () => {
    enable();
    const result = await verify(REVIEW_EMAIL, REVIEW_CODE);
    expect(result.ok).toBe(true);
    expect(spies.otpFindFirst).not.toHaveBeenCalled();
    expect(spies.otpUpdate).not.toHaveBeenCalled();
    expect(spies.logInfo).toHaveBeenCalledWith("auth.app-review-login", { stage: "verify", outcome: "accepted" });
  });

  it("неверный код — обычный отказ CODE_NOT_FOUND и счётчик неверных попыток", async () => {
    enable();
    const result = await verify(REVIEW_EMAIL, "111111");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(((await result.response.json()) as { error: { code: string } }).error.code).toBe("CODE_NOT_FOUND");
    expect(spies.registerVerifyFailure).toHaveBeenCalledTimes(1);
    expect((spies.registerVerifyFailure.mock.calls[0] as unknown[])[0]).toBe(REVIEW_EMAIL);
    expect(spies.logInfo).toHaveBeenCalledWith("auth.app-review-login", { stage: "verify", outcome: "rejected" });
  });

  it("блокировка после неверных попыток действует и с верным кодом", async () => {
    enable();
    spies.checkVerifyLock.mockResolvedValue({ ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: 600 });
    const result = await verify(REVIEW_EMAIL, REVIEW_CODE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(429);
    expect(spies.resolveEmailLoginProfile).not.toHaveBeenCalled();
  });

  it("постоянный код не открывает другой адрес", async () => {
    enable();
    const result = await verify("client@example.com", REVIEW_CODE);
    expect(result.ok).toBe(false);
    expect(spies.otpFindFirst).toHaveBeenCalled();
  });

  it("выключено — постоянный код не работает даже для этого адреса", async () => {
    const result = await verify(REVIEW_EMAIL, REVIEW_CODE);
    expect(result.ok).toBe(false);
    expect(spies.otpFindFirst).toHaveBeenCalled();
  });
});
