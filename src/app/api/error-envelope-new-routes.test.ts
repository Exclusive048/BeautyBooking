import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ERROR-ENVELOPE-NEW-ROUTES (E-05, 2026-10-30) — роуты, добавленные после
 * 2026-08-15 (мобильный вход, «Где я вошёл», конфиг приложения, «Первые шаги»,
 * приветствие, точки навигации), и веб-близнецы OTP-входа отвечают на
 * неожиданное исключение КОНВЕРТОМ `{ ok:false, error:{ message, code } }`, а не
 * HTML-страницей 500 Next, и пишут `logError` с маршрутом и стеком.
 *
 * Проверяется поведение: сервис бросает — обработчик НЕ отклоняется и отдаёт
 * JSON. Без `try/catch` `await handler()` здесь бросает сам, и тест краснеет.
 *
 * @probe 2026-10-30 — снят `try/catch` в `me/setup-guide` (оба метода) →
 *        красные «GET/PATCH /api/me/setup-guide: сбой — конверт 500» и
 *        «PATCH … невалидное тело — 400» (`parseBody` бросает наружу, тест
 *        получает отклонённый промис); в `mobile/v1/auth/otp/verify` вместо
 *        `toAuthSurfaceError` подставлен `toAppError` и `appError.details`
 *        четвёртым аргументом → красный «граница auth не отдаёт details».
 */

const mocks = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  getSessionUserId: vi.fn(),
  setSessionCookies: vi.fn(),
  listActiveSessionFamilies: vi.fn(),
  revokeSessionFamily: vi.fn(),
  revokeOtherSessionFamilies: vi.fn(),
  verifyPhoneOtpLogin: vi.fn(),
  verifyEmailOtpLogin: vi.fn(),
  completeOtpLogin: vi.fn(),
  respondWithMobileOtpLogin: vi.fn(),
  buildMobileAppConfig: vi.fn(),
  getClientSidebarCounts: vi.fn(),
  requireAuth: vi.fn(),
  markWelcomeSeen: vi.fn(),
  invalidateMeIdentityCache: vi.fn(),
  loadMasterSetupGuide: vi.fn(),
  loadStudioSetupGuide: vi.fn(),
  resolveSetupGuideStudio: vi.fn(),
  updateSetupGuide: vi.fn(),
  providerFindFirst: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionContext: mocks.getSessionContext,
  getSessionUserId: mocks.getSessionUserId,
  setSessionCookies: mocks.setSessionCookies,
}));
vi.mock("@/lib/auth/session-families", () => ({
  listActiveSessionFamilies: mocks.listActiveSessionFamilies,
  revokeSessionFamily: mocks.revokeSessionFamily,
  revokeOtherSessionFamilies: mocks.revokeOtherSessionFamilies,
}));
vi.mock("@/lib/auth/otp-login", () => ({
  verifyPhoneOtpLogin: mocks.verifyPhoneOtpLogin,
  verifyEmailOtpLogin: mocks.verifyEmailOtpLogin,
  completeOtpLogin: mocks.completeOtpLogin,
}));
vi.mock("@/lib/auth/mobile-session", () => ({
  respondWithMobileOtpLogin: mocks.respondWithMobileOtpLogin,
}));
vi.mock("@/lib/mobile/app-config", () => ({ buildMobileAppConfig: mocks.buildMobileAppConfig }));
vi.mock("@/lib/http/origin", () => ({ getPublicOrigin: () => "https://masterryadom.ru" }));
vi.mock("@/lib/client-cabinet/sidebar-counts", () => ({
  getClientSidebarCounts: mocks.getClientSidebarCounts,
}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/onboarding/welcome-seen", () => ({ markWelcomeSeen: mocks.markWelcomeSeen }));
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache: mocks.invalidateMeIdentityCache }));
vi.mock("@/lib/onboarding/setup-guide", () => ({
  loadMasterSetupGuide: mocks.loadMasterSetupGuide,
  loadStudioSetupGuide: mocks.loadStudioSetupGuide,
  resolveSetupGuideStudio: mocks.resolveSetupGuideStudio,
  updateSetupGuide: mocks.updateSetupGuide,
}));
vi.mock("@/lib/master/access", () => ({ personalMasterProviderWhere: () => ({}) }));
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findFirst: mocks.providerFindFirst } } }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
// Побочные эффекты `fail(…, 5xx)` — алерт и отчёт в трекер — здесь не предмет.
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));
vi.mock("@/lib/monitoring/alert-cooldown", () => ({ sendAlertWithCooldown: vi.fn() }));
// Частичный мок: `withRequestContext` нужен настоящий `withRequestId`.
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logError: mocks.logError,
  logInfo: vi.fn(),
}));

import { AppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { GET as sessionsGET } from "@/app/api/me/sessions/route";
import { DELETE as sessionDELETE } from "@/app/api/me/sessions/[id]/route";
import { POST as revokeOthersPOST } from "@/app/api/me/sessions/revoke-others/route";
import { POST as mobileOtpPOST } from "@/app/api/mobile/v1/auth/otp/verify/route";
import { POST as mobileEmailOtpPOST } from "@/app/api/mobile/v1/auth/otp/email/verify/route";
import { POST as webOtpPOST } from "@/app/api/auth/otp/verify/route";
import { POST as webEmailOtpPOST } from "@/app/api/auth/otp/email/verify/route";
import { GET as mobileConfigGET } from "@/app/api/mobile/v1/config/route";
import { GET as attentionGET } from "@/app/api/me/attention/route";
import { POST as welcomePOST } from "@/app/api/me/welcome/route";
import { GET as setupGuideGET, PATCH as setupGuidePATCH } from "@/app/api/me/setup-guide/route";

const DB_DOWN = () => new Error("Can't reach database server");
const AUTHED = { ok: true as const, user: { id: "u1" } };

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`https://masterryadom.ru${path}`, {
    method,
    headers: { "content-type": "application/json", "x-request-id": "req-e05" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

type Case = {
  route: string;
  arm: () => void;
  call: () => Promise<Response>;
};

const CASES: Case[] = [
  {
    route: "GET /api/me/sessions",
    arm: () => mocks.getSessionContext.mockRejectedValue(DB_DOWN()),
    call: () => sessionsGET(req("GET", "/api/me/sessions")),
  },
  {
    route: "DELETE /api/me/sessions/{id}",
    arm: () => {
      mocks.getSessionContext.mockResolvedValue({ user: { id: "u1" }, familyId: "f1" });
      mocks.revokeSessionFamily.mockRejectedValue(DB_DOWN());
    },
    call: () =>
      sessionDELETE(req("DELETE", "/api/me/sessions/f2"), { params: Promise.resolve({ id: "f2" }) }),
  },
  {
    route: "POST /api/me/sessions/revoke-others",
    arm: () => {
      mocks.getSessionContext.mockResolvedValue({ user: { id: "u1" }, familyId: "f1" });
      mocks.revokeOtherSessionFamilies.mockRejectedValue(DB_DOWN());
    },
    call: () => revokeOthersPOST(req("POST", "/api/me/sessions/revoke-others")),
  },
  {
    route: "POST /api/mobile/v1/auth/otp/verify",
    arm: () => mocks.verifyPhoneOtpLogin.mockRejectedValue(DB_DOWN()),
    call: () => mobileOtpPOST(req("POST", "/api/mobile/v1/auth/otp/verify", { phone: "+79991234567", code: "123456" })),
  },
  {
    route: "POST /api/mobile/v1/auth/otp/email/verify",
    arm: () => mocks.verifyEmailOtpLogin.mockRejectedValue(DB_DOWN()),
    call: () => mobileEmailOtpPOST(req("POST", "/api/mobile/v1/auth/otp/email/verify", { email: "a@b.ru", code: "123456" })),
  },
  {
    route: "POST /api/auth/otp/verify",
    arm: () => mocks.verifyPhoneOtpLogin.mockRejectedValue(DB_DOWN()),
    call: () => webOtpPOST(req("POST", "/api/auth/otp/verify", { phone: "+79991234567", code: "123456" })),
  },
  {
    route: "POST /api/auth/otp/email/verify",
    arm: () => mocks.verifyEmailOtpLogin.mockRejectedValue(DB_DOWN()),
    call: () => webEmailOtpPOST(req("POST", "/api/auth/otp/email/verify", { email: "a@b.ru", code: "123456" })),
  },
  {
    route: "GET /api/mobile/v1/config",
    arm: () => mocks.buildMobileAppConfig.mockRejectedValue(DB_DOWN()),
    call: () => mobileConfigGET(req("GET", "/api/mobile/v1/config")),
  },
  {
    route: "GET /api/me/attention",
    arm: () => {
      mocks.getSessionUserId.mockResolvedValue("u1");
      mocks.getClientSidebarCounts.mockRejectedValue(DB_DOWN());
    },
    call: () => attentionGET(req("GET", "/api/me/attention")),
  },
  {
    route: "POST /api/me/welcome",
    arm: () => {
      mocks.requireAuth.mockResolvedValue(AUTHED);
      mocks.markWelcomeSeen.mockRejectedValue(DB_DOWN());
    },
    call: () => welcomePOST(req("POST", "/api/me/welcome")),
  },
  {
    route: "GET /api/me/setup-guide",
    arm: () => {
      mocks.requireAuth.mockResolvedValue(AUTHED);
      mocks.loadMasterSetupGuide.mockRejectedValue(DB_DOWN());
    },
    call: () => setupGuideGET(req("GET", "/api/me/setup-guide?scope=master")),
  },
  {
    route: "PATCH /api/me/setup-guide",
    arm: () => {
      mocks.requireAuth.mockResolvedValue(AUTHED);
      mocks.providerFindFirst.mockResolvedValue({ id: "p1" });
      mocks.updateSetupGuide.mockRejectedValue(DB_DOWN());
    },
    call: () => setupGuidePATCH(req("PATCH", "/api/me/setup-guide", { scope: "master", action: "hide" })),
  },
];

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("ERROR-ENVELOPE-NEW-ROUTES · сбой — конверт, а не HTML-страница 500", () => {
  it.each(CASES)("$route: сбой — конверт 500 и logError с маршрутом", async ({ route, arm, call }) => {
    arm();

    const res = await call();

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      error: { message: "Не получилось. Попробуйте ещё раз.", code: "INTERNAL_ERROR" },
    });
    // Отказ не должен осесть в разделяемом кэше (конфиг приложения).
    expect(res.headers.get("cache-control") ?? "").not.toContain("public");
    expect(mocks.logError).toHaveBeenCalledWith(
      `${route.replace("{id}", "[id]")} failed`,
      expect.objectContaining({ route, requestId: "req-e05", stack: expect.any(String) }),
    );
  });
});

describe("ERROR-ENVELOPE-NEW-ROUTES · отказы 4xx сохраняют свой код", () => {
  it("PATCH /api/me/setup-guide: невалидное тело — 400 VALIDATION_ERROR, а не 500", async () => {
    mocks.requireAuth.mockResolvedValue(AUTHED);

    const res = await setupGuidePATCH(req("PATCH", "/api/me/setup-guide", { scope: "master", action: "explode" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.logError).not.toHaveBeenCalled();
    expect(mocks.updateSetupGuide).not.toHaveBeenCalled();
  });

  it("PATCH /api/me/setup-guide: нечитаемый JSON — 400, а не 500", async () => {
    mocks.requireAuth.mockResolvedValue(AUTHED);

    const res = await setupGuidePATCH(req("PATCH", "/api/me/setup-guide", "{not json"));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it.each([
    ["POST /api/mobile/v1/auth/otp/verify", mobileOtpPOST, mocks.verifyPhoneOtpLogin],
    ["POST /api/auth/otp/verify", webOtpPOST, mocks.verifyPhoneOtpLogin],
    ["POST /api/mobile/v1/auth/otp/email/verify", mobileEmailOtpPOST, mocks.verifyEmailOtpLogin],
    ["POST /api/auth/otp/email/verify", webEmailOtpPOST, mocks.verifyEmailOtpLogin],
  ] as const)("%s: отказ сервиса уходит как есть", async (_route, handler, verify) => {
    verify.mockResolvedValue({
      ok: false,
      response: fail("Неверный код. Попробуйте ещё раз.", 401, "CODE_NOT_FOUND"),
    });

    const res = await handler(req("POST", "/x", { code: "000000" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("CODE_NOT_FOUND");
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it.each([
    ["POST /api/mobile/v1/auth/otp/verify", mobileOtpPOST, mocks.verifyPhoneOtpLogin],
    ["POST /api/auth/otp/verify", webOtpPOST, mocks.verifyPhoneOtpLogin],
    ["POST /api/mobile/v1/auth/otp/email/verify", mobileEmailOtpPOST, mocks.verifyEmailOtpLogin],
    ["POST /api/auth/otp/email/verify", webEmailOtpPOST, mocks.verifyEmailOtpLogin],
  ] as const)("%s: граница auth не отдаёт details брошенного AppError", async (_route, handler, verify) => {
    verify.mockRejectedValue(
      new AppError("Попробуйте позже.", 409, "CONFLICT", { providerResponse: "сырой ответ" }),
    );

    const res = await handler(req("POST", "/x", { code: "000000" }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.details).toBeUndefined();
  });
});
