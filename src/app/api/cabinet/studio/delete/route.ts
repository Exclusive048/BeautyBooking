import { requireAuth } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { deleteStudioCabinet } from "@/lib/deletion/delete-studio";
import { extractClientIp } from "@/lib/http/ip";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const ip = extractClientIp(req);
  const ipKey = routeRateLimitKey(req, "ip", ip ?? "unknown");
  const ipRateLimit = await checkRateLimit(ipKey, RATE_LIMITS.destructiveDelete);
  if (ipRateLimit.limited) {
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  const userKey = routeRateLimitKey(req, "user", auth.user.id);
  const userRateLimit = await checkRateLimit(userKey, RATE_LIMITS.destructiveDelete);
  if (userRateLimit.limited) {
    return fail("Слишком часто. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  try {
    await deleteStudioCabinet(auth.user.id);
    return ok({ deleted: true });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    if (appError.code === "ACTIVE_BOOKINGS") {
      return fail("Есть активные записи", 409, "ACTIVE_BOOKINGS", appError.details);
    }
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
