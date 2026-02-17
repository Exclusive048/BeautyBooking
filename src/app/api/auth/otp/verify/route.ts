import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/lib/auth/jwt";
import { AccountType, ConsentType } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { hashOtpCode } from "@/lib/auth/otp";
import { otpVerifySchema } from "@/lib/auth/schemas";
import { ensureClientRoleForUser } from "@/lib/auth/roles";

const CONSENT_DOCUMENT_VERSION = "1.0";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }
  const { phone, code } = parsed.data;

  const now = new Date();
  const codeHash = hashOtpCode(phone, code);

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
    return fail("Code not found", 401, "CODE_NOT_FOUND");
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
        roles: [AccountType.CLIENT],
      },
    });
  } else {
    const nextRoles = await ensureClientRoleForUser(profile.id, profile.roles);
    if (nextRoles !== profile.roles) {
      profile = { ...profile, roles: nextRoles };
    }
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");

  try {
    await prisma.userConsent.createMany({
      data: [
        {
          userId: profile.id,
          consentType: ConsentType.TERMS,
          documentVersion: CONSENT_DOCUMENT_VERSION,
          ipAddress,
          userAgent,
        },
        {
          userId: profile.id,
          consentType: ConsentType.PRIVACY,
          documentVersion: CONSENT_DOCUMENT_VERSION,
          ipAddress,
          userAgent,
        },
      ],
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("Failed to save user consents", { userId: profile.id, error });
  }

  const token = createSessionToken(
    { sub: profile.id, phone: profile.phone ?? null, roles: profile.roles },
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

  const redirectDecision = await resolveCabinetRedirect(profile.id);
  return ok({ redirect: redirectDecision.target });
}
