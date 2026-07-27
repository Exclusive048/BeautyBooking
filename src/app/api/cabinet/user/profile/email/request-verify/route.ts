import { NextResponse } from "next/server";
import { z } from "zod";
import { OtpChannel, Prisma } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkOtpEmailRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { extractClientIp } from "@/lib/http/ip";
import { isEmailConfigured, sendEmail } from "@/lib/email/sender";
import {
  buildOtpEmailHtml,
  buildOtpEmailText,
} from "@/lib/email/templates/otp-code";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { maskEmail } from "@/lib/logging/masking";
import { isProduction } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().email().max(255),
});

/**
 * EMAIL-VERIFY-FIX-A: map Prisma's `P2002` unique-violation on
 * `UserProfile.email` to a user-friendly 409. Atomic catch (no
 * pre-check — TOCTOU race avoided). Mirrors `mapPrismaBookingConflict`
 * in `src/lib/bookings/createBooking.ts:26-37`. Exported for unit
 * testing only; the route handler is the sole production caller.
 */
export function mapEmailAlreadyUsedConflict(error: unknown): AppError | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new AppError(
      "Этот email уже используется другим аккаунтом. Укажите другой адрес.",
      409,
      "EMAIL_ALREADY_USED",
    );
  }
  return null;
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
    //
    // EMAIL-VERIFY-FIX-A: catch P2002 atomically (no pre-check — TOCTOU
    // race avoided). `UserProfile.email` is `@unique`; if another user
    // owns this address `mapEmailAlreadyUsedConflict` surfaces a
    // user-friendly 409 instead of leaking a 500. Other Prisma errors
    // re-throw → upstream `toAppError` maps them.
    try {
      await prisma.userProfile.update({
        where: { id: user.id },
        data: { email: normalizedEmail, emailVerifiedAt: null },
      });
    } catch (error) {
      const mapped = mapEmailAlreadyUsedConflict(error);
      if (mapped) throw mapped;
      throw error;
    }

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

    // OTP-LOG-DEV-GUARD-A: `code` only in dev/staging (closes SEC-1
    // regression-gap vs SMS-GATEWAY-A — production logs never carry it).
    // Rule 9: the failure log (with the dev-only code) is kept so testers can
    // still complete the flow via the logged code — only the API contract
    // changes below, not the logging.
    if (!sent) {
      logInfo("Cabinet email OTP requested (send failed)", {
        userId: user.id,
        email: maskEmail(normalizedEmail),
        expiresAt: expiresAt.toISOString(),
        ...(isProduction ? {} : { code }),
      });
      // FIX-POLISH-01 (walkthrough #7): a failed send must NOT report success.
      // This used to fall through to `jsonOk`, so the modal falsely advanced to
      // «Код отправлен» and the user waited for mail that never arrives. Surface
      // the failure so the UI stays on the email step and shows an honest error.
      // The `email`/`emailVerifiedAt` mutation + OtpCode row above already
      // persisted (retry re-sends) — the «…Попробуйте ещё раз.» copy doesn't
      // imply nothing happened.
      return jsonFail(
        502,
        "Не удалось отправить код на email. Попробуйте ещё раз.",
        "EMAIL_SEND_FAILED",
      );
    }

    logInfo("Cabinet email OTP requested", {
      userId: user.id,
      email: maskEmail(normalizedEmail),
      expiresAt: expiresAt.toISOString(),
    });

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
