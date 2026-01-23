import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/lib/auth/jwt";

function normalizePhone(input: string) {
  const cleaned = input.replace(/[()\s-]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
}

function hashCode(phone: string, code: string) {
  const secret = process.env.AUTH_JWT_SECRET!;
  return crypto.createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhone((body?.phone as string) ?? "");
  const code = String((body?.code as string) ?? "").trim();

  if (!phone || phone.length < 8) {
    return NextResponse.json({ ok: false, error: "INVALID_PHONE" }, { status: 400 });
  }
  if (!code || code.length < 4) {
    return NextResponse.json({ ok: false, error: "INVALID_CODE" }, { status: 400 });
  }

  const now = new Date();
  const codeHash = hashCode(phone, code);

  const otp = await prisma.otpCode.findFirst({
    where: {
      phone,
      codeHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return NextResponse.json({ ok: false, error: "CODE_NOT_FOUND" }, { status: 401 });
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { usedAt: now },
  });

  let profile = await prisma.userProfile.findUnique({ where: { phone } });
  if (!profile) {
    profile = await prisma.userProfile.create({
      data: {
        phone,
        roles: ["CLIENT"],
      },
    });
  } else {
    // гарантируем, что CLIENT есть всегда
    if (!profile.roles.includes("CLIENT")) {
      profile = await prisma.userProfile.update({
        where: { id: profile.id },
        data: { roles: { set: Array.from(new Set([...profile.roles, "CLIENT"])) as any } },
      });
    }
  }

  const token = createSessionToken(
    { sub: profile.id, phone: profile.phone ?? null, roles: profile.roles as any },
    60 * 60 * 24 * 30
  );

  const cookieName = process.env.AUTH_COOKIE_NAME ?? "bh_session";
  const cookieStore = await cookies();

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true });
}
