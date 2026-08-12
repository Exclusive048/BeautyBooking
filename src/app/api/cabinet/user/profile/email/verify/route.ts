import { NextResponse } from "next/server";
import { z } from "zod";
import { OtpChannel } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { releaseUnverifiedEmailClaims } from "@/lib/auth/email-claim";
import { hashOtpCode } from "@/lib/auth/otp";
import {
  checkOtpEmailVerifyLock,
  clearOtpEmailVerifyFailures,
  registerOtpEmailVerifyFailure,
} from "@/lib/auth/otp-rate-limit";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { maskEmail } from "@/lib/logging/masking";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";
import { extractClientIp } from "@/lib/http/ip";

export const runtime = "nodejs";

const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

/**
 * Cabinet-side verify: matches a pending email OTP, marks `emailVerifiedAt`,
 * and consumes the code. Does NOT issue or rotate the session — the user
 * is already authenticated. Reuses the same `OtpCode` table as login flow
 * (channel=EMAIL).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const body = await parseBody(req, verifySchema);

    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    if (!profile?.email) {
      return jsonFail(400, "Сначала укажите email", "VALIDATION_ERROR");
    }

    const normalizedEmail = profile.email.toLowerCase();

    // O2: scope verify lockout by (email + client IP) — see otp-rate-limit.ts.
    const clientIp = extractClientIp(req);

    const lockCheck = await checkOtpEmailVerifyLock(normalizedEmail, clientIp);
    if (!lockCheck.ok) {
      return NextResponse.json(
        { ok: false, error: { message: lockCheck.error ?? "Слишком много попыток. Попробуйте позже.", code: "RATE_LIMITED" } },
        {
          status: lockCheck.status,
          headers: { "Retry-After": String(lockCheck.retryAfterSec) },
        },
      );
    }

    const now = new Date();
    const codeHash = hashOtpCode(normalizedEmail, body.code);

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
        return NextResponse.json(
          {
            ok: false,
            error: { message: failResult.error ?? "Слишком много попыток. Попробуйте позже.", code: "RATE_LIMITED" },
          },
          {
            status: failResult.status,
            headers: { "Retry-After": String(failResult.retryAfterSec) },
          },
        );
      }
      return jsonFail(401, "Код не подходит", "CODE_NOT_FOUND");
    }

    // EMAIL-ADDRESS-OCCUPATION: отметка владения и освобождение чужих
    // НЕподтверждённых заявок на этот адрес — одной транзакцией. Вынесены из
    // `Promise.all` намеренно: там ветки независимы, а здесь порядок и
    // атомарность существенны — иначе между освобождением и отметкой
    // существует окно, в котором адрес не принадлежит никому.
    await prisma.$transaction(async (tx) => {
      await releaseUnverifiedEmailClaims(tx, normalizedEmail, user.id);
      await tx.userProfile.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
      await tx.otpCode.update({ where: { id: otp.id }, data: { usedAt: now } });
    });
    await clearOtpEmailVerifyFailures(normalizedEmail, clientIp);

    logInfo("Cabinet email verify completed", {
      userId: user.id,
      email: maskEmail(normalizedEmail),
    });

    return jsonOk({ verified: true, verifiedAt: now.toISOString() });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/cabinet/user/profile/email/verify failed", {
        requestId: getRequestId(req),
        route: "POST /api/cabinet/user/profile/email/verify",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
