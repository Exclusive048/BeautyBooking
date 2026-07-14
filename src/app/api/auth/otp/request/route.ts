import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkOtpRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { otpRequestSchema } from "@/lib/auth/schemas";
import { logInfo } from "@/lib/logging/logger";
import { maskPhone } from "@/lib/logging/masking";
import { isProduction } from "@/lib/env";
import { sendOtpSms } from "@/lib/sms";
import { extractClientIp } from "@/lib/http/ip";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const body = await req.json().catch(() => null);
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { phone } = parsed.data;
    const rateLimit = await checkOtpRequestRateLimit({ phone, ip: extractClientIp(req) });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: rateLimit.error, retryAfterSec: rateLimit.retryAfterSec },
        { status: rateLimit.status, headers: { "Retry-After": String(rateLimit.retryAfterSec) } }
      );
    }

    const code = generateOtpCode();
    const codeHash = hashOtpCode(phone, code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.otpCode.create({
      data: {
        phone,
        codeHash,
        expiresAt,
      },
    });

    // SMS-GATEWAY-A: real SMS via configured provider (SMSC.ru in prod).
    // When `SMS_PROVIDER_ENABLED=false` the factory selects the mock
    // provider, which logs the code locally — preserving the dev workflow
    // documented in CONTEXT P1 («OTP в логах», `MVP: no SMS gateway yet`).
    // OTP-LOG-DEV-GUARD-A: `code` is included in dev/staging only (saves
    // SMSC credits + helps QA); production logs strip it for 152-ФЗ hygiene.
    logInfo("OTP requested", {
      phone: maskPhone(phone),
      expiresAt: expiresAt.toISOString(),
      ...(isProduction ? {} : { code }),
    });

    const smsResult = await sendOtpSms(phone, code);
    if (!smsResult.success) {
      // Fail-soft: provider outage never 500-s the auth route. The OTP row
      // is already persisted, so a successful retry within 5 min re-delivers
      // (rate-limit governs retry pacing).
      return NextResponse.json(
        {
          error: "SMS_DELIVERY_FAILED",
          reason: smsResult.error,
          message:
            "Не удалось отправить SMS. Попробуйте ещё раз через минуту.",
        },
        { status: 503 },
      );
    }

    return ok({});
  });
}
