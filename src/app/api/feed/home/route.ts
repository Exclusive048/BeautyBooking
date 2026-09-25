import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { listHomeFeedGroups } from "@/lib/feed/home-feed.service";
import { homeFeedQuerySchema } from "@/lib/feed/schemas";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
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
      `rl:/api/feed/home:ip:${getClientIp(req)}`,
      RATE_LIMITS.feedHome,
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const query = parseQuery(new URL(req.url), homeFeedQuerySchema);
    const user = await getSessionUser();
    const data = await listHomeFeedGroups({
      limit: query.limit,
      cursor: query.cursor,
      currentUserId: user?.id,
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
