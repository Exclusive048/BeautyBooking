import { NextResponse } from "next/server";
import { OtpChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkOtpEmailRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { otpRateLimitFail } from "@/lib/auth/otp-rate-limit-response";
import { otpEmailRequestSchema } from "@/lib/auth/schemas";
import { isEmailConfigured, sendEmail } from "@/lib/email/sender";
import { buildOtpEmailHtml, buildOtpEmailText } from "@/lib/email/templates/otp-code";
import { logInfo } from "@/lib/logging/logger";
import { maskEmail } from "@/lib/logging/masking";
import { isProduction } from "@/lib/env";
import { extractClientIp } from "@/lib/http/ip";
import { observeAuthClientIp } from "@/lib/http/proxy-trust";
import { isAppReviewLoginEmail, logAppReviewLogin } from "@/lib/auth/app-review-login";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    // ENV-SPLIT-01: килсвитч EMAIL_AUTH_ENABLED удалён (дефолт всегда был ON,
    // выключение канала = убрать SMTP-креды). Гейт конфигурации остаётся:
    if (!isEmailConfigured()) {
      return fail("Вход по email не настроен.", 503, "EMAIL_NOT_CONFIGURED");
    }

    const body = await req.json().catch(() => null);
    const parsed = otpEmailRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // FIX-B17: см. телефонный близнец — наблюдение до лимитера, чтобы отказы
    // самого лимитера не выключали детектор.
    observeAuthClientIp(req, normalizedEmail);
    const rateLimit = await checkOtpEmailRequestRateLimit({ email: normalizedEmail, ip: extractClientIp(req) });
    if (!rateLimit.ok) {
      return otpRateLimitFail(rateLimit);
    }

    // MOBILE-POLISH: адрес для App Review (`APP_REVIEW_LOGIN_EMAIL`) — письмо
    // не отправляется и код не создаётся: вход примет постоянный код из env.
    // Ответ тот же, что всем, — снаружи режим не отличить. Лимит выше уже
    // посчитан, как для любого адреса.
    if (isAppReviewLoginEmail(normalizedEmail)) {
      logAppReviewLogin("request", "accepted");
      return ok({});
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
    if (!sent) {
      logInfo("Email OTP requested (send failed)", {
        email: maskEmail(normalizedEmail),
        expiresAt: expiresAt.toISOString(),
        ...(isProduction ? {} : { code }),
      });
    } else {
      logInfo("Email OTP requested", {
        email: maskEmail(normalizedEmail),
        expiresAt: expiresAt.toISOString(),
      });
    }

    return ok({});
  });
}
