import { getSessionUser, getSessionUserId } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
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
    // причина), поэтому и вырезать нечего: непринимаемый ключ отбрасывает Zod.
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const t0 = Date.now();
    const updated = await updateMeProfile(sessionUser.id, parsed.data);
    logInfo("PATCH /api/me profile updated", { userId: sessionUser.id, ms: Date.now() - t0 });

    // PHONE-CLAIM-01: `phone` снова принимается — но как ЗАЯВКА без силы
    // (см. lib/auth/phone-claim.ts). Phone-keyed adoption гостевых броней здесь
    // по-прежнему НЕ выполняется (SECURITY-EXPOSURE-AUDIT-01 #2): усыновление
    // живёт только в OTP-verify, где владение номером доказано.
    await invalidateMeIdentityCache(sessionUser.id);

    return ok({ user: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // PHONE-CLAIM-01 + FIX-C8: отказ действенный (нужен ДРУГОЙ номер/адрес,
      // повтор не поможет) — поэтому конкретная строка по meta.target, а не
      // общее «Телефон или email уже используется». Увиденного держателя
      // claimPhoneForUser отклоняет сам (AppError 409); сюда доходит гонка.
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
      return fail(
        target.includes("phone")
          ? "Этот номер уже используется другим аккаунтом. Укажите другой номер."
          : "Этот email уже используется другим аккаунтом. Укажите другой адрес.",
        409,
        "CONFLICT",
      );
    }
    const appError = toAppError(error);
    if (appError.status < 500) {
      // claimPhoneForUser бросает AppError (409 занятый номер, 404) — его
      // курируемая строка обязана дойти до пользователя, а не схлопнуться в
      // канонический 500 (FIX-C8: действенный отказ показывается дословно).
      return fail(appError.message, appError.status, appError.code);
    }
    return fail("Не удалось сохранить профиль. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
