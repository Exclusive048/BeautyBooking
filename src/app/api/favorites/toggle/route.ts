import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validation";
import { favoriteToggleSchema } from "@/lib/favorites/schemas";
import { toggleProviderFavorite } from "@/lib/favorites/service";

export const runtime = "nodejs";

const FAVORITE_TOGGLE_RATE_LIMIT = {
  windowSeconds: 60,
  maxRequests: 30,
};

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    // Per-user rate limit; IP fallback when session is somehow missing isn't
    // needed because we already require auth above. 30/min is generous for
    // intentional clicks but cuts off scripted abuse.
    const rl = await checkRateLimit(
      `rl:/api/favorites/toggle:user:${user.id}:ip:${getClientIp(req)}`,
      FAVORITE_TOGGLE_RATE_LIMIT,
    );
    if (rl.limited) {
      return tooManyRequests(rl.retryAfterSeconds);
    }

    const body = await parseBody(req, favoriteToggleSchema);
    const result = await toggleProviderFavorite(user.id, body.providerId);
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/favorites/toggle failed", {
        requestId: getRequestId(req),
        route: "POST /api/favorites/toggle",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
