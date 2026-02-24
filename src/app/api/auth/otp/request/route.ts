import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { otpRequestSchema } from "@/lib/auth/schemas";
import { checkOtpRequestRateLimit } from "@/lib/auth/otp-rate-limit";
import { NextResponse } from "next/server";

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

  // MVP: пока без доставки — печатаем в консоль сервера
  console.log(`[OTP] phone=${phone} code=${code} expiresAt=${expiresAt.toISOString()}`);

  return ok({});
}
