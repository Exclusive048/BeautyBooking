import { NextResponse } from "next/server";
import { OtpChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { hashOtpCode } from "@/lib/auth/otp";
import {
  checkOtpEmailVerifyLock,
  clearOtpEmailVerifyFailures,
  registerOtpEmailVerifyFailure,
} from "@/lib/auth/otp-rate-limit";
import { findVerifiedEmailProfile, resolveEmailLoginProfile } from "@/lib/auth/email-login-profile";
import { isEmailAuthEnabled } from "@/lib/env";
import { otpEmailVerifySchema } from "@/lib/auth/schemas";
import { setSessionCookies } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { invalidateMeIdentityCache } from "@/lib/users/me";
import { extractClientIp } from "@/lib/http/ip";
import { hasRequiredConsents } from "@/lib/legal/consent-flags";
import { recordUserConsents } from "@/lib/legal/consent";
import { UI_TEXT } from "@/lib/ui/text";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    // FIX-SEC-EMAIL-IDENTITY-01: килсвитч канала — до любой работы, как в
    // AUTH-GATE-01 у телефона. Гейтится и `verify`, а не только `request`:
    // иначе выключение канала не отзывает уже выданные коды.
    if (!isEmailAuthEnabled) {
      return fail("Вход по email временно недоступен.", 503, "SYSTEM_FEATURE_DISABLED");
    }

    const body = await req.json().catch(() => null);
    const parsed = otpEmailVerifySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { email, code, consent } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // O2: scope verify lockout by (email + client IP) — see otp-rate-limit.ts.
    const clientIp = extractClientIp(req);

    const lockCheck = await checkOtpEmailVerifyLock(normalizedEmail, clientIp);
    if (!lockCheck.ok) {
      return NextResponse.json(
        { error: lockCheck.error, retryAfterSec: lockCheck.retryAfterSec },
        { status: lockCheck.status, headers: { "Retry-After": String(lockCheck.retryAfterSec) } }
      );
    }

    const now = new Date();
    const codeHash = hashOtpCode(normalizedEmail, code);

    const otp = await prisma.otpCode.findFirst({
      where: {
        email: normalizedEmail,
        channel: OtpChannel.EMAIL,
        codeHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      const failResult = await registerOtpEmailVerifyFailure(normalizedEmail, clientIp);
      if (!failResult.ok) {
        void recordSurfaceEvent({ surface: "auth", outcome: "failure", operation: "otp-email-verify", code: failResult.error ?? "OTP_VERIFY_LOCKED" });
        return NextResponse.json(
          { error: failResult.error, retryAfterSec: failResult.retryAfterSec },
          { status: failResult.status, headers: { "Retry-After": String(failResult.retryAfterSec) } }
        );
      }
      void recordSurfaceEvent({ surface: "auth", outcome: "failure", operation: "otp-email-verify", code: "CODE_NOT_FOUND" });
      return fail("Код не найден или истёк.", 401, "CODE_NOT_FOUND");
    }

    // RKN-FIX-01 (mirrors the phone route): resolve new-vs-existing BEFORE the
    // code is consumed, so a consent refusal doesn't burn the user's code.
    //
    // 🔴 FIX-SEC-EMAIL-IDENTITY-01: ищем ТОЛЬКО профиль с подтверждённым
    // адресом. Раньше здесь был `findUnique({ where: { email } })` — любая
    // строка, включая занятую без доказательства владения (кабинетный
    // request-verify пишет адрес до подтверждения), считалась «этот
    // пользователь вернулся». Итог: владелец адреса вводил свой код и получал
    // сессию В ЧУЖОЙ профиль. Неподтверждённая строка теперь для входа
    // невидима — решение принимает `findVerifiedEmailProfile`.
    const existingProfile = await findVerifiedEmailProfile(normalizedEmail);

    if (!existingProfile && !hasRequiredConsents(consent)) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "denied",
        operation: "otp-email-verify",
        code: "CONSENT_REQUIRED",
      });
      return fail(UI_TEXT.auth.loginPage.consentRequired, 400, "CONSENT_REQUIRED");
    }

    await Promise.all([
      clearOtpEmailVerifyFailures(normalizedEmail, clientIp),
      prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: now } }),
    ]);

    // OTP-EMAIL-LOGIN-RACE: create-or-recover is delegated so a P2002 from two
    // simultaneous first-time logins re-reads the winner's row instead of
    // erroring (6th re-read-on-conflict site — see email-login-profile.ts).
    // FIX-SEC-EMAIL-IDENTITY-01: отказ «адрес занят строкой без доказательства
    // владения» — это НОРМАЛЬНОЕ решение, а не сбой. Без этого catch AppError
    // улетал в общий обработчик и превращался в 500: пользователь видел
    // «ошибку сервера», а GlitchTip получал алерт на штатную ветку.
    let profile;
    try {
      profile = await resolveEmailLoginProfile(normalizedEmail, existingProfile);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code === "EMAIL_NOT_VERIFIED") {
        void recordSurfaceEvent({
          surface: "auth",
          outcome: "denied",
          operation: "otp-email-verify",
          code: appError.code,
        });
        return fail(appError.message, appError.status, appError.code);
      }
      throw error;
    }

    const ipAddress = clientIp;
    const userAgent = req.headers.get("user-agent");

    // RKN-FIX-01 — same single writer as every other registration path.
    const consentPromise = consent
      ? recordUserConsents({ userId: profile.id, flags: consent, ipAddress, userAgent })
      : Promise.resolve();

    const redirectDecision = await resolveCabinetRedirect(profile.id);
    await consentPromise;

    const response = ok({ redirect: redirectDecision.target });
    await setSessionCookies(response, { sub: profile.id, phone: profile.phone ?? null, roles: profile.roles });

    void ensureFreeSubscriptionsForRoles(profile.id, profile.roles).catch((error) => {
      logError("ensureFreeSubscriptionsForRoles failed after email otp verify", {
        userProfileId: profile.id,
        error: error instanceof Error ? error.stack : error,
      });
      void sendTelegramAlert(
        "A user logged in via email without a free subscription",
        "auth:free-subscription:email-otp"
      );
    });
    void invalidateMeIdentityCache(profile.id);
    logInfo("Email OTP verify completed", { userProfileId: profile.id });

    return response;
  });
}
