import { getSessionUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { profileUpdateSchema } from "@/lib/users/schemas";
import { getMeProfile, updateMeProfile } from "@/lib/users/profile";
import { Prisma } from "@prisma/client";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return ok({ user: null });
  }

  const profile = await getMeProfile(user.id);
  return ok({ user: profile });
}

export async function PATCH(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return fail("Unauthorized", 401, "UNAUTHORIZED");
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const updated = await updateMeProfile(sessionUser.id, parsed.data);
    return ok({ user: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Phone or email already used", 409, "CONFLICT");
    }
    return fail("Failed to save profile", 500, "INTERNAL_ERROR");
  }
}
