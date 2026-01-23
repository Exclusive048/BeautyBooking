import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

function normalizePhone(input: string) {
  const cleaned = input.replace(/[()\s-]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(phone: string, code: string) {
  const secret = process.env.AUTH_JWT_SECRET!;
  return crypto.createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phoneRaw = body?.phone as string | undefined;

  const phone = normalizePhone(phoneRaw ?? "");
  if (!phone || phone.length < 8) {
    return NextResponse.json({ ok: false, error: "INVALID_PHONE" }, { status: 400 });
  }

  const code = generateCode();
  const codeHash = hashCode(phone, code);
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

  return NextResponse.json({ ok: true });
}
