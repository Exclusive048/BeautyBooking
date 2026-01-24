import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { emptyBodySchema } from "@/lib/auth/schemas";
import { AccountType } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = emptyBodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return fail("Unauthorized", 401, "UNAUTHORIZED");
  }

  const user = data.user;

  // Важно: у phone-юзера phone лежит в user.phone
  // (email может быть null)
  const phone = user.phone ?? null;

  const profile = await prisma.userProfile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      roles: [AccountType.CLIENT],
      phone: phone ?? undefined,
    },
    update: {
      phone: phone ?? undefined,
    },
  });

  return ok({ profile });
}
