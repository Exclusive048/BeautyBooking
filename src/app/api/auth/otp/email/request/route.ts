import { NextResponse } from "next/server";
import { OtpChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkOtpEmailRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { otpEmailRequestSchema } from "@/lib/auth/schemas";
import { isEmailConfigured, sendEmail } from "@/lib/email/sender";
import { buildOtpEmailHtml, buildOtpEmailText } from "@/lib/email/templates/otp-code";
import { logInfo } from "@/lib/logging/logger";

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return null;
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    if (!isEmailConfigured()) {
      return fail("Email login is not configured", 503, "EMAIL_NOT_CONFIGURED");
    }

    const body = await req.json().catch(() => null);
    const parsed = otpEmailRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const rateLimit = await checkOtpEmailRequestRateLimit({ email: normalizedEmail, ip: extractClientIp(req) });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: rateLimit.error, retryAfterSec: rateLimit.retryAfterSec },
        { status: rateLimit.status, headers: { "Retry-After": String(rateLimit.retryAfterSec) } }
      );
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

    // Log code for dev/test environments when email is not delivered
    if (!sent) {
      logInfo("Email OTP requested (send failed)", { email: normalizedEmail, code, expiresAt: expiresAt.toISOString() });
    } else {
      logInfo("Email OTP requested", { email: normalizedEmail, expiresAt: expiresAt.toISOString() });
    }

    return ok({});
  });
}
