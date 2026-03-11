import { NextResponse } from "next/server";
import { AccountType, ConsentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { hashOtpCode } from "@/lib/auth/otp";
import { checkOtpVerifyLock, clearOtpVerifyFailures, registerOtpVerifyFailure } from "@/lib/auth/otp-rate-limit";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { otpVerifySchema } from "@/lib/auth/schemas";
import { setSessionCookies } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { linkGuestBookingsToUserByPhone } from "@/lib/bookings/link-guest-bookings";
import { invalidateMeIdentityCache } from "@/lib/users/me";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";

const CONSENT_DOCUMENT_VERSION = "1.0";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const routeStartedAt = Date.now();
    const body = await req.json().catch(() => null);
    const parsed = otpVerifySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    const { phone, code } = parsed.data;

    const lockCheck = await checkOtpVerifyLock(phone);
    if (!lockCheck.ok) {
      return NextResponse.json(
        { error: lockCheck.error, retryAfterSec: lockCheck.retryAfterSec },
        { status: lockCheck.status, headers: { "Retry-After": String(lockCheck.retryAfterSec) } }
      );
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
      const failResult = await registerOtpVerifyFailure(phone);
      if (!failResult.ok) {
        return NextResponse.json(
          { error: failResult.error, retryAfterSec: failResult.retryAfterSec },
          { status: failResult.status, headers: { "Retry-After": String(failResult.retryAfterSec) } }
        );
      }
      return fail("Code not found", 401, "CODE_NOT_FOUND");
    }

    const verifyDbStartedAt = Date.now();
    const [, , existingProfile] = await Promise.all([
      clearOtpVerifyFailures(phone),
      prisma.otpCode.update({
        where: { id: otp.id },
        data: { usedAt: now },
      }),
      prisma.userProfile.findUnique({ where: { phone } }),
    ]);

    let profile = existingProfile;

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          phone,
          roles: [AccountType.CLIENT],
        },
      });
    } else {
      const nextRoles = await ensureClientRoleForUser(profile.id, profile.roles);
      if (nextRoles !== profile.roles) {
        profile = { ...profile, roles: nextRoles };
      }
    }
    logInfo("OTP verify primary DB queries done", {
      userProfileId: profile.id,
      ms: Date.now() - verifyDbStartedAt,
    });

    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;
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
    const consentPromise = prisma.userConsent
      .createMany({
        data: [
          {
            userId: profile.id,
            consentType: ConsentType.TERMS,
            documentVersion: CONSENT_DOCUMENT_VERSION,
            ipAddress,
            userAgent,
          },
          {
            userId: profile.id,
            consentType: ConsentType.PRIVACY,
            documentVersion: CONSENT_DOCUMENT_VERSION,
            ipAddress,
            userAgent,
          },
        ],
        skipDuplicates: true,
      })
      .catch((error) => {
        logError("Failed to save user consents", {
          userId: profile.id,
          error: error instanceof Error ? error.stack : String(error),
        });
      });

    const redirectDecision = await resolveCabinetRedirect(profile.id);
    await Promise.all([linkBookingsPromise, consentPromise]);
    logInfo("OTP verify side effects done", {
      userProfileId: profile.id,
      ms: Date.now() - sideEffectsStartedAt,
    });

    const response = ok({ redirect: redirectDecision.target });
    setSessionCookies(response, { sub: profile.id, phone: profile.phone ?? null, roles: profile.roles });

    void ensureFreeSubscriptionsForRoles(profile.id, profile.roles).catch((error) => {
      logError("ensureFreeSubscriptionsForRoles failed after otp verify", {
        userProfileId: profile.id,
        error: error instanceof Error ? error.stack : error,
      });
      sendTelegramAlert(
        `User ${profile.id} logged in without free subscription`,
        `auth:free-subscription:otp:${profile.id}`
      );
    });
    void invalidateMeIdentityCache(profile.id);
    logInfo("OTP verify completed", { userProfileId: profile.id, totalMs: Date.now() - routeStartedAt });

    return response;
  });
}
