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
    return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
  }

  try {
    const body = await req.json().catch(() => null);

    // LOGIC-24: раньше здесь стояли ДВЕ зачистки — `displayName`/`address`
    // вырезались из сырого тела до разбора и из результата после, хотя схема
    // их описывала, а `updateMeProfile` их писал. Поля убраны из схемы (там же
    // причина), поэтому и вырезать нечего: непринимаемый ключ отбрасывает Zod,
    // ровно как `phone`.
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const t0 = Date.now();
    const updated = await updateMeProfile(sessionUser.id, parsed.data);
    logInfo("PATCH /api/me profile updated", { userId: sessionUser.id, ms: Date.now() - t0 });

    // No phone-keyed adoption here: `phone` is no longer writable via this route
    // (SECURITY-EXPOSURE-AUDIT-01 #2). Guest-booking adoption runs only in the
    // OTP-verify route, where the user has proven control of the number.
    await invalidateMeIdentityCache(sessionUser.id);

    return ok({ user: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Телефон или email уже используется.", 409, "CONFLICT");
    }
    return fail("Не удалось сохранить профиль. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
