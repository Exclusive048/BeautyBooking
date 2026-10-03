import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { assertAccountDeletable, deleteUserAccount } from "@/lib/deletion/delete-account";
import { extractClientIp } from "@/lib/http/ip";
import { clearSessionCookies } from "@/lib/auth/session";
import { z } from "zod";

// 29.09 доработки · 26: галочка «Удалить и мои отзывы» (действует, только если
// политика отзывов — USER_CHOICE; иначе сервер её не учитывает).
const deleteQuerySchema = z.object({ deleteReviews: z.enum(["1"]).optional() });

export const runtime = "nodejs";

function refusal(error: unknown) {
  const appError = error instanceof AppError ? error : toAppError(error);
  if (appError.code === "ACTIVE_BOOKINGS") {
    return fail("Есть активные записи", 409, "ACTIVE_BOOKINGS", appError.details);
  }
  return fail(appError.message, appError.status, appError.code, appError.details);
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // MOBILE-CLIENT-01 (B7): запрос разбирается ДО лимита частоты — опечатка в
  // параметре не должна стоить единственной попытки в час.
  const query = deleteQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) {
    return fail("Некорректный запрос.", 400, "VALIDATION_ERROR");
  }

  // 29.09 доработки · 26: отказ из-за живых записей — ДО лимита частоты. Он
  // ничего не разрушает, а лимит — одна попытка в час: иначе человек, который
  // отменил записи по подсказке и повторил, получал бы час «Слишком часто».
  try {
    await assertAccountDeletable(auth.user.id);
  } catch (error) {
    return refusal(error);
  }

  const ip = extractClientIp(req);
  const ipKey = routeRateLimitKey(req, "ip", ip ?? "unknown");
  const ipRateLimit = await checkRateLimit(ipKey, RATE_LIMITS.destructiveDelete);
  if (ipRateLimit.limited) {
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  const userKey = routeRateLimitKey(req, "user", auth.user.id);
  const userRateLimit = await checkRateLimit(userKey, RATE_LIMITS.destructiveDelete);
  if (userRateLimit.limited) {
    // Удаление не запускалось — попытка адреса не тратится (за общим адресом
    // мобильного оператора она одна на всех соседей).
    await refundRateLimit(ipKey);
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  try {
    await deleteUserAccount(auth.user.id, { deleteReviews: query.data.deleteReviews === "1" });

    const res = ok({ deleted: true });
    // DELETION-03: снимаются ОБЕ куки сессии — раньше `bh_refresh` оставалась.
    clearSessionCookies(res);
    return res;
  } catch (error) {
    // MOBILE-CLIENT-01 (B7): удаление упало по вине сервера (5xx) — попытка
    // возвращается в оба ведра, повтор доступен сразу, а не через час.
    // Отказ по существу (4xx) попыткой остаётся. Fail-closed не меняется:
    // при обрыве Redis сюда не доходят — `checkRateLimit` отказывает выше.
    if (toAppError(error).status >= 500) {
      await Promise.all([refundRateLimit(ipKey), refundRateLimit(userKey)]);
    }
    return refusal(error);
  }
}
