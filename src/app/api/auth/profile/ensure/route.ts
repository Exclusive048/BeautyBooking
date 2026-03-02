import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { emptyBodySchema } from "@/lib/auth/schemas";
import { AccountType } from "@prisma/client";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth/jwt";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = emptyBodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const cookieStore = await cookies();
  const name = process.env.AUTH_COOKIE_NAME ?? "bh_session";
  const token = cookieStore.get(name)?.value;
  if (!token) {
    return fail("Unauthorized", 401, "UNAUTHORIZED");
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return fail("Unauthorized", 401, "UNAUTHORIZED");
  }

  const phone = payload.phone ?? null;

  const profile = await prisma.userProfile.upsert({
    where: { id: payload.sub },
    create: {
      id: payload.sub,
      roles: [AccountType.CLIENT],
      phone: phone ?? undefined,
    },
    update: {
      phone: phone ?? undefined,
    },
  });

  return ok({ profile });
}
