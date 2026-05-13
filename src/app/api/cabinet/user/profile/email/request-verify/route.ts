import { NextResponse } from "next/server";
import { z } from "zod";
import { OtpChannel } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkOtpEmailRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { isEmailConfigured, sendEmail } from "@/lib/email/sender";
import {
  buildOtpEmailHtml,
  buildOtpEmailText,
} from "@/lib/email/templates/otp-code";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().email().max(255),
});

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

/**
 * Sends a 6-digit OTP to the requested email for cabinet-side verification.
 * Reuses the email-login OTP infrastructure (`OtpCode` rows with
 * `channel=EMAIL`, same HMAC, same rate-limit windows) — verification just
 * sets `emailVerifiedAt` on UserProfile instead of issuing a session.
 *
 * Setting `email` on the user happens here so subsequent verify can match
 * by `userProfile.email`. We also reset `emailVerifiedAt` to null on any
 * email change — switching addresses always requires re-verification.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    if (!isEmailConfigured()) {
      return jsonFail(503, "Email login is not configured", "SYSTEM_FEATURE_DISABLED");
    }

    const body = await parseBody(req, requestSchema);
    const normalizedEmail = body.email.toLowerCase();

    const rateLimit = await checkOtpEmailRequestRateLimit({
      email: normalizedEmail,
      ip: extractClientIp(req),
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { ok: false, error: { message: rateLimit.error ?? "Rate limited", code: "RATE_LIMITED" } },
        {
          status: rateLimit.status,
          headers: { "Retry-After": String(rateLimit.retryAfterSec) },
        },
      );
    }

    // Apply the email immediately and reset verification — UI shows
    // unverified state until the verify endpoint runs.
    await prisma.userProfile.update({
      where: { id: user.id },
      data: { email: normalizedEmail, emailVerifiedAt: null },
    });

    const code = generateOtpCode();
    const codeHash = hashOtpCode(normalizedEmail, code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.otpCode.create({
      data: {
        email: normalizedEmail,
        channel: OtpChannel.EMAIL,
        codeHash,
        expiresAt,
      },
    });

    const sent = await sendEmail({
      to: normalizedEmail,
      subject: "Код подтверждения — МастерРядом",
      html: buildOtpEmailHtml(code),
      text: buildOtpEmailText(code),
    });

    if (!sent) {
      logInfo("Cabinet email OTP requested (send failed)", {
        userId: user.id,
        email: normalizedEmail,
        code,
        expiresAt: expiresAt.toISOString(),
      });
    } else {
      logInfo("Cabinet email OTP requested", {
        userId: user.id,
        email: normalizedEmail,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return jsonOk({ expiresAt: expiresAt.toISOString() });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/cabinet/user/profile/email/request-verify failed", {
        requestId: getRequestId(req),
        route: "POST /api/cabinet/user/profile/email/request-verify",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
