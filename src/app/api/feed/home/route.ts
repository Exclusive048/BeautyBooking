import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCityParam } from "@/lib/cities/server-city";
import { listHomeFeedGroups } from "@/lib/feed/home-feed.service";
import { homeFeedQuerySchema } from "@/lib/feed/schemas";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { viewerRateLimitKey } from "@/lib/rate-limit/subject";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * HOME-FEED-COLLAGE — лента главной: плитки-группы загрузки одного автора
 * (правило 48 часов — `lib/feed/upload-window.ts`). Сессия необязательна: она
 * нужна только для отметки «автор уже в избранном». Ответ зависит от смотрящего,
 * поэтому общего кэша у роута нет.
 */
export async function GET(req: Request) {
  try {
    const rateLimit = await checkRateLimit(
      // MOBILE-B1: вошедший — ведро аккаунта, аноним — IP (CGNAT, `rate-limit/subject.ts`).
      viewerRateLimitKey(req),
      RATE_LIMITS.feedHome,
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const query = parseQuery(new URL(req.url), homeFeedQuerySchema);
    // MOBILE-B1: `?city=<slug>` — лента города; без параметра — все города, как на вебе.
    const city = await resolveCityParam(query.city);
    const user = await getSessionUser();
    const data = await listHomeFeedGroups({
      limit: query.limit,
      cursor: query.cursor,
      currentUserId: user?.id,
      cityId: city?.id,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/feed/home failed", {
        requestId: getRequestId(req),
        route: "GET /api/feed/home",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
