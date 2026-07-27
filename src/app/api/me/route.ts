import { getSessionUser, getSessionUserId } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { profileUpdateSchema } from "@/lib/users/schemas";
import { updateMeProfile } from "@/lib/users/profile";
import {
  getCachedMeIdentity,
  getMeIdentityFromDb,
  invalidateMeIdentityCache,
  setCachedMeIdentity,
} from "@/lib/users/me";
import { Prisma } from "@prisma/client";
import { logInfo } from "@/lib/logging/logger";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return ok({ user: null });
  }

  const cached = await getCachedMeIdentity(userId);
  if (cached) {
    logInfo("GET /api/me cache hit", { userId });
    return ok({ user: cached });
  }

  const t0 = Date.now();
  const profile = await getMeIdentityFromDb(userId);
  logInfo("GET /api/me db query done", { userId, ms: Date.now() - t0 });

  if (profile) {
    void setCachedMeIdentity(userId, profile);
  }

  return ok({ user: profile });
}

export async function PATCH(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return fail("Unauthorized", 401, "UNAUTHORIZED");
  }

  try {
    const body = await req.json().catch(() => null);
    let sanitizedBody: unknown = body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const rest = { ...(body as Record<string, unknown>) };
      delete rest.displayName;
      delete rest.address;
      sanitizedBody = rest;
    }

    const parsed = profileUpdateSchema.safeParse(sanitizedBody);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    const updatableData = { ...parsed.data };
    delete updatableData.displayName;
    delete updatableData.address;

    const t0 = Date.now();
    const updated = await updateMeProfile(sessionUser.id, updatableData);
    logInfo("PATCH /api/me profile updated", { userId: sessionUser.id, ms: Date.now() - t0 });

    // No phone-keyed adoption here: `phone` is no longer writable via this route
    // (SECURITY-EXPOSURE-AUDIT-01 #2). Guest-booking adoption runs only in the
    // OTP-verify route, where the user has proven control of the number.
    await invalidateMeIdentityCache(sessionUser.id);

    return ok({ user: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Phone or email already used", 409, "CONFLICT");
    }
    return fail("Failed to save profile", 500, "INTERNAL_ERROR");
  }
}
