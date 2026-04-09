import { NextResponse } from "next/server";
import { AccountType, ConsentType, OtpChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { hashOtpCode } from "@/lib/auth/otp";
import {
  checkOtpEmailVerifyLock,
  clearOtpEmailVerifyFailures,
  registerOtpEmailVerifyFailure,
} from "@/lib/auth/otp-rate-limit";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { otpEmailVerifySchema } from "@/lib/auth/schemas";
import { setSessionCookies } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { invalidateMeIdentityCache } from "@/lib/users/me";

const CONSENT_DOCUMENT_VERSION = "1.0";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const body = await req.json().catch(() => null);
    const parsed = otpEmailVerifySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { email, code } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const lockCheck = await checkOtpEmailVerifyLock(normalizedEmail);
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
      const failResult = await registerOtpEmailVerifyFailure(normalizedEmail);
      if (!failResult.ok) {
        void recordSurfaceEvent({ surface: "auth", outcome: "failure", operation: "otp-email-verify", code: failResult.error ?? "OTP_VERIFY_LOCKED" });
        return NextResponse.json(
          { error: failResult.error, retryAfterSec: failResult.retryAfterSec },
          { status: failResult.status, headers: { "Retry-After": String(failResult.retryAfterSec) } }
        );
      }
      void recordSurfaceEvent({ surface: "auth", outcome: "failure", operation: "otp-email-verify", code: "CODE_NOT_FOUND" });
      return fail("Code not found", 401, "CODE_NOT_FOUND");
    }

    const [, , existingProfile] = await Promise.all([
      clearOtpEmailVerifyFailures(normalizedEmail),
      prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: now } }),
      prisma.userProfile.findUnique({ where: { email: normalizedEmail } }),
    ]);

    let profile = existingProfile;

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: { email: normalizedEmail, roles: [AccountType.CLIENT] },
      });
    } else {
      const nextRoles = await ensureClientRoleForUser(profile.id, profile.roles);
      if (nextRoles !== profile.roles) {
        profile = { ...profile, roles: nextRoles };
      }
    }

    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent");

    const consentPromise = prisma.userConsent
      .createMany({
        data: [
          { userId: profile.id, consentType: ConsentType.TERMS, documentVersion: CONSENT_DOCUMENT_VERSION, ipAddress, userAgent },
          { userId: profile.id, consentType: ConsentType.PRIVACY, documentVersion: CONSENT_DOCUMENT_VERSION, ipAddress, userAgent },
        ],
        skipDuplicates: true,
      })
      .catch((error) => {
        logError("Failed to save user consents (email otp)", {
          userId: profile.id,
          error: error instanceof Error ? error.stack : String(error),
        });
      });

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
        `User ${profile.id} logged in via email without free subscription`,
        `auth:free-subscription:email-otp:${profile.id}`
      );
    });
    void invalidateMeIdentityCache(profile.id);
    logInfo("Email OTP verify completed", { userProfileId: profile.id });

    return response;
  });
}
