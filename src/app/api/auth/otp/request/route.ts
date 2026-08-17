import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkOtpRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { otpRateLimitFail } from "@/lib/auth/otp-rate-limit-response";
import { otpRequestSchema } from "@/lib/auth/schemas";
import { logInfo } from "@/lib/logging/logger";
import { maskPhone } from "@/lib/logging/masking";
import { isPhoneAuthEnabled, isProduction } from "@/lib/env";
import { sendOtpSms } from "@/lib/sms";
import { extractClientIp } from "@/lib/http/ip";
import { observeAuthClientIp } from "@/lib/http/proxy-trust";

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    // AUTH-GATE-01: refuse before ANY work when phone auth is off — no OTP
    // generated, no OtpCode row, no log line, no SMS attempt. Mirrors the
    // AUTH-KILLSWITCH-ENFORCE-01 shape (gate first, then the flow), so hiding
    // the phone tab in the UI is defence-in-depth rather than the only guard.
    // The response is constant for every input, so it leaks nothing about
    // whether a number is registered; the `publicApi` rate-limit tier in
    // `proxy.ts` still applies (middleware runs ahead of this handler), so a
    // disabled endpoint is not a free probing surface.
    if (!isPhoneAuthEnabled) {
      return fail("Вход по телефону временно недоступен.", 503, "SYSTEM_FEATURE_DISABLED");
    }

    const body = await req.json().catch(() => null);
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { phone } = parsed.data;
    // FIX-B17: наблюдение стоит ДО лимитера намеренно. Схлопывание клиентского
    // IP проявляется как раз отказами лимитера — считая только пропущенные
    // запросы, детектор слепнет ровно тогда, когда дефект начал кусаться.
    // Ничего не ждёт и не бросает (см. `proxy-trust.ts`).
    observeAuthClientIp(req, phone);
    const rateLimit = await checkOtpRequestRateLimit({ phone, ip: extractClientIp(req) });
    if (!rateLimit.ok) {
      return otpRateLimitFail(rateLimit);
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
      // SECURITY-EXPOSURE-AUDIT-01 · Y16: `reason` echoed the raw SmsErrorCode
      // (INSUFFICIENT_BALANCE / AUTH_FAILED / IP_BLOCKED), disclosing SMS-gateway
      // account state to anonymous callers. The code is still logged server-side
      // (sendOtpSms → logError); the client sees only a generic message.
      // FIX-B14: тот же конверт, что у остальных отказов. Прежняя форма несла
      // `error: "SMS_DELIVERY_FAILED"` рядом с `message` на верхнем уровне —
      // `fetchJson` читает `error.message` и до этого текста не доходил.
      return fail(
        "Не удалось отправить SMS. Попробуйте ещё раз через минуту.",
        503,
        "SMS_DELIVERY_FAILED",
      );
    }

    return ok({});
  });
}
