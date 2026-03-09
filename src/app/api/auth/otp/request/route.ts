import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { formatZodError } from "@/lib/api/validation";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkOtpRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { otpRequestSchema } from "@/lib/auth/schemas";
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

    // MVP: no SMS gateway yet, keep OTP logging for local validation.
    logInfo("OTP requested", {
      phone,
      code,
      expiresAt: expiresAt.toISOString(),
    });

    return ok({});
  });
}
