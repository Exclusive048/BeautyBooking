import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { hashOtpCode } from "@/lib/auth/otp";
import { checkOtpVerifyLock, clearOtpVerifyFailures, registerOtpVerifyFailure } from "@/lib/auth/otp-rate-limit";
import { otpRateLimitFail } from "@/lib/auth/otp-rate-limit-response";
import { resolvePhoneLoginProfile } from "@/lib/auth/phone-login-profile";
import { otpVerifySchema } from "@/lib/auth/schemas";
import { setSessionCookies } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { linkGuestBookingsToUserByPhone } from "@/lib/bookings/link-guest-bookings";
import { invalidateMeIdentityCache } from "@/lib/users/me";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { extractClientIp } from "@/lib/http/ip";
import { hasRequiredConsents } from "@/lib/legal/consent-flags";
import { recordUserConsents } from "@/lib/legal/consent";
import { isPhoneAuthEnabled } from "@/lib/env";
import { UI_TEXT } from "@/lib/ui/text";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    // AUTH-GATE-01: gating `/request` alone is not enough — unused OtpCode rows
    // issued before the flag was flipped stay valid for 5 minutes, and this is
    // the endpoint that actually mints a session. Refuse here too, before any
    // lookup, so phone auth cannot issue NEW sessions while it is off.
    // Session VALIDATION, refresh and logout are deliberately untouched:
    // everyone already signed in stays signed in.
    if (!isPhoneAuthEnabled) {
      return fail("Вход по телефону временно недоступен.", 503, "SYSTEM_FEATURE_DISABLED");
    }

    const routeStartedAt = Date.now();
    const body = await req.json().catch(() => null);
    const parsed = otpVerifySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    const { phone, code, consent } = parsed.data;

    // O2: verify lockout is scoped by (phone + client IP) so a third party who
    // knows the number can't lock the owner out. Resolved once, up front.
    const clientIp = extractClientIp(req);

    const lockCheck = await checkOtpVerifyLock(phone, clientIp);
    if (!lockCheck.ok) {
      return otpRateLimitFail(lockCheck);
    }

    const now = new Date();
    const codeHash = hashOtpCode(phone, code);

    const otp = await prisma.otpCode.findFirst({
      where: {
        phone,
        codeHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      const failResult = await registerOtpVerifyFailure(phone, clientIp);
      if (!failResult.ok) {
        void recordSurfaceEvent({
          surface: "auth",
          outcome: "failure",
          operation: "otp-verify",
          code: failResult.error ?? "OTP_VERIFY_LOCKED",
        });
        return otpRateLimitFail(failResult);
      }
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "failure",
        operation: "otp-verify",
        code: "CODE_NOT_FOUND",
      });
      return fail("Код не найден или истёк.", 401, "CODE_NOT_FOUND");
    }

    const verifyDbStartedAt = Date.now();
    // RKN-FIX-01: the "is this a registration?" answer is needed BEFORE the
    // code is burned — refusing a first-time login for missing consent must not
    // cost the user their one-time code. So this lookup is pulled out of the
    // side-effect batch below and awaited first.
    const existingProfile = await prisma.userProfile.findUnique({ where: { phone } });

    // Server-side enforcement, not just UI gating: creating an account without
    // consent to the offer AND to PD processing is exactly what 152-ФЗ ст. 9
    // (ред. 156-ФЗ) forbids. Existing users are never blocked — their consent
    // is already on record and a login is not a new registration.
    if (!existingProfile && !hasRequiredConsents(consent)) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "denied",
        operation: "otp-verify",
        code: "CONSENT_REQUIRED",
      });
      return fail(UI_TEXT.auth.loginPage.consentRequired, 400, "CONSENT_REQUIRED");
    }

    await Promise.all([
      clearOtpVerifyFailures(phone, clientIp),
      prisma.otpCode.update({
        where: { id: otp.id },
        data: { usedAt: now },
      }),
    ]);

    // OTP-PHONE-LOGIN-RACE: create-or-recover is delegated so a P2002 from two
    // simultaneous first-time logins re-reads the winner's row instead of
    // erroring (7th re-read-on-conflict site — see phone-login-profile.ts).
    const profile = await resolvePhoneLoginProfile(phone, existingProfile);
    logInfo("OTP verify primary DB queries done", {
      userProfileId: profile.id,
      ms: Date.now() - verifyDbStartedAt,
    });

    const ipAddress = clientIp;
    const userAgent = req.headers.get("user-agent");

    const sideEffectsStartedAt = Date.now();
    const linkBookingsPromise = profile.phone
      ? linkGuestBookingsToUserByPhone({ userProfileId: profile.id, phoneRaw: profile.phone }).catch((error) => {
          logError("linkGuestBookingsToUserByPhone failed after otp verify", {
            userProfileId: profile.id,
            error: error instanceof Error ? error.stack : error,
          });
        })
      : Promise.resolve();
    // RKN-FIX-01: one writer for every path, versions from the legal source of
    // truth, no row spam on repeat logins (see `recordUserConsents`). Nothing
    // is written when the client sent no flags — an unticked box must never
    // materialise as consent.
    const consentPromise = consent
      ? recordUserConsents({ userId: profile.id, flags: consent, ipAddress, userAgent })
      : Promise.resolve();

    const redirectDecision = await resolveCabinetRedirect(profile.id);
    await Promise.all([linkBookingsPromise, consentPromise]);
    logInfo("OTP verify side effects done", {
      userProfileId: profile.id,
      ms: Date.now() - sideEffectsStartedAt,
    });

    const response = ok({ redirect: redirectDecision.target });
    await setSessionCookies(response, { sub: profile.id, phone: profile.phone ?? null, roles: profile.roles });

    void ensureFreeSubscriptionsForRoles(profile.id, profile.roles).catch((error) => {
      logError("ensureFreeSubscriptionsForRoles failed after otp verify", {
        userProfileId: profile.id,
        error: error instanceof Error ? error.stack : error,
      });
      void sendTelegramAlert(
        "A user logged in without a free subscription",
        "auth:free-subscription:otp"
      );
    });
    void invalidateMeIdentityCache(profile.id);
    logInfo("OTP verify completed", { userProfileId: profile.id, totalMs: Date.now() - routeStartedAt });

    return response;
  });
}
