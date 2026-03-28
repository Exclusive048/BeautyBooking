import { ok, fail } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRecentMasters } from "@/lib/bookings/recent-masters";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Необходима авторизация.", 401, "UNAUTHORIZED");

    const rl = await checkRateLimit(`recent-masters:${user.id}`, RATE_LIMITS.publicApi);
    if (rl.limited) return fail("Слишком много запросов.", 429, "RATE_LIMITED");

    const items = await getRecentMasters(user.id);
    return ok({ items });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/bookings/recent-masters failed", {
        requestId: getRequestId(req),
        route: "GET /api/bookings/recent-masters",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
