import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * AUTH-GATE-01 — server-side enforcement of the phone (OTP) auth kill-switch.
 *
 * Same contract as AUTH-KILLSWITCH-ENFORCE-01 (see killswitch-gate.test.ts) but
 * for the OTP routes, and with one extra obligation: `/request` must refuse
 * BEFORE the OTP is generated, persisted or logged, and `/verify` must refuse
 * independently — otherwise an OtpCode row minted just before the flag flipped
 * would still buy a session for its full 5-minute window.
 *
 *  - flag OFF → 503 SYSTEM_FEATURE_DISABLED; no OtpCode row, no SMS, no
 *    session cookies, not even a rate-limit read;
 *  - flag ON  → the gate does not leak into the working flow.
 */

const flags = vi.hoisted(() => ({ phone: false }));

const spies = vi.hoisted(() => ({
  otpCreate: vi.fn(async () => ({ id: "otp1" })),
  otpFindFirst: vi.fn(async () => null as unknown),
  otpUpdate: vi.fn(async () => ({})),
  userFindUnique: vi.fn(async () => null as unknown),
  sendOtpSms: vi.fn(async () => ({ success: true as const, messageId: "m1" })),
  setSessionCookies: vi.fn(),
  checkOtpRequestRateLimit: vi.fn(async () => ({ ok: true as const })),
  checkOtpVerifyLock: vi.fn(async () => ({ ok: true as const })),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  get isPhoneAuthEnabled() {
    return flags.phone;
  },
  isProduction: false,
  // `hashOtpCode` reads this through `env`; the flag-ON cases need it present.
  env: { OTP_HMAC_SECRET: "test-otp-hmac-secret" },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpCode: {
      create: spies.otpCreate,
      findFirst: spies.otpFindFirst,
      update: spies.otpUpdate,
    },
    userProfile: { findUnique: spies.userFindUnique },
    userConsent: { createMany: vi.fn(async () => ({ count: 0 })) },
  },
}));

vi.mock("@/lib/sms", () => ({ sendOtpSms: spies.sendOtpSms }));
vi.mock("@/lib/auth/session", () => ({ setSessionCookies: spies.setSessionCookies }));
vi.mock("@/lib/auth/otp-rate-limit", () => ({
  checkOtpRequestRateLimit: spies.checkOtpRequestRateLimit,
  checkOtpVerifyLock: spies.checkOtpVerifyLock,
  clearOtpVerifyFailures: vi.fn(async () => {}),
  registerOtpVerifyFailure: vi.fn(async () => ({ ok: true })),
}));
// Partial mock: `withRequestContext` needs the real `withRequestId` from this
// module, so only the two emitters are replaced.
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: spies.logInfo,
  logError: spies.logError,
}));
vi.mock("@/lib/auth/cabinet-redirect", () => ({
  resolveCabinetRedirect: vi.fn(async () => ({ target: "/cabinet" })),
}));
vi.mock("@/lib/auth/phone-login-profile", () => ({
  resolvePhoneLoginProfile: vi.fn(async () => ({ id: "u1", phone: "+79991234567", roles: ["CLIENT"] })),
}));
vi.mock("@/lib/billing/ensure-free-subscription", () => ({ ensureFreeSubscriptionsForRoles: vi.fn() }));
vi.mock("@/lib/bookings/link-guest-bookings", () => ({ linkGuestBookingsToUserByPhone: vi.fn(async () => {}) }));
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache: vi.fn() }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));

// Quiet the 5xx alert side-effect of `fail(..., 503, ...)`.
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { POST as otpRequest } from "@/app/api/auth/otp/request/route";
import { POST as otpVerify } from "@/app/api/auth/otp/verify/route";

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function payload(res: Response): Promise<string> {
  return JSON.stringify(await res.json());
}

describe("AUTH-GATE-01 — phone OTP routes honour PHONE_AUTH_ENABLED", () => {
  beforeEach(() => {
    flags.phone = false;
    vi.clearAllMocks();
    spies.checkOtpRequestRateLimit.mockResolvedValue({ ok: true });
    spies.checkOtpVerifyLock.mockResolvedValue({ ok: true });
    spies.otpFindFirst.mockResolvedValue(null);
  });

  describe("POST /api/auth/otp/request", () => {
    it("disabled → 503 SYSTEM_FEATURE_DISABLED", async () => {
      const res = await otpRequest(
        jsonReq("http://localhost/api/auth/otp/request", { phone: "+79991234567" }),
      );
      expect(res.status).toBe(503);
      expect(await payload(res)).toContain("SYSTEM_FEATURE_DISABLED");
    });

    it("disabled → no OTP row is created and no SMS is attempted", async () => {
      await otpRequest(jsonReq("http://localhost/api/auth/otp/request", { phone: "+79991234567" }));
      expect(spies.otpCreate).not.toHaveBeenCalled();
      expect(spies.sendOtpSms).not.toHaveBeenCalled();
    });

    it("disabled → nothing is logged (an OTP can never reach the log)", async () => {
      await otpRequest(jsonReq("http://localhost/api/auth/otp/request", { phone: "+79991234567" }));
      expect(spies.logInfo).not.toHaveBeenCalled();
    });

    it("disabled → refuses before the request body is even validated", async () => {
      // A malformed body would normally 400 VALIDATION_ERROR. The gate wins,
      // proving it sits ahead of the whole flow (no probing signal either way).
      const res = await otpRequest(jsonReq("http://localhost/api/auth/otp/request", { nope: 1 }));
      expect(res.status).toBe(503);
      expect(spies.checkOtpRequestRateLimit).not.toHaveBeenCalled();
    });

    it("enabled → NOT short-circuited (gate doesn't leak into the flow)", async () => {
      flags.phone = true;
      const res = await otpRequest(
        jsonReq("http://localhost/api/auth/otp/request", { phone: "+79991234567" }),
      );
      expect(res.status).toBe(200);
      expect(spies.otpCreate).toHaveBeenCalledOnce();
      expect(spies.sendOtpSms).toHaveBeenCalledOnce();
    });
  });

  describe("POST /api/auth/otp/verify", () => {
    it("disabled → 503 SYSTEM_FEATURE_DISABLED, no session issued", async () => {
      const res = await otpVerify(
        jsonReq("http://localhost/api/auth/otp/verify", { phone: "+79991234567", code: "123456" }),
      );
      expect(res.status).toBe(503);
      expect(await payload(res)).toContain("SYSTEM_FEATURE_DISABLED");
      expect(spies.setSessionCookies).not.toHaveBeenCalled();
    });

    it("disabled → a still-valid pre-existing OTP row cannot be redeemed", async () => {
      // The row exists and would otherwise verify — the gate must refuse first.
      spies.otpFindFirst.mockResolvedValue({ id: "otp1", phone: "+79991234567" });
      const res = await otpVerify(
        jsonReq("http://localhost/api/auth/otp/verify", { phone: "+79991234567", code: "123456" }),
      );
      expect(res.status).toBe(503);
      expect(spies.otpFindFirst).not.toHaveBeenCalled();
      expect(spies.otpUpdate).not.toHaveBeenCalled();
      expect(spies.setSessionCookies).not.toHaveBeenCalled();
    });

    it("enabled → NOT short-circuited (reaches the lookup)", async () => {
      flags.phone = true;
      await otpVerify(
        jsonReq("http://localhost/api/auth/otp/verify", { phone: "+79991234567", code: "123456" }),
      );
      expect(spies.otpFindFirst).toHaveBeenCalledOnce();
    });
  });
});
