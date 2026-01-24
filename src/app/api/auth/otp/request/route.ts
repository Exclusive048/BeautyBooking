import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { otpRequestSchema } from "@/lib/auth/schemas";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = otpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const { phone } = parsed.data;
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
