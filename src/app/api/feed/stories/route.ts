import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getActiveStoriesGroups } from "@/lib/feed/stories.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { getClientIp } from "@/lib/http/ip";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const rateLimit = await checkRateLimit(
      `rl:/api/feed/stories:ip:${getClientIp(req)}`,
      RATE_LIMITS.feedStories,
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const data = await getActiveStoriesGroups();
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/feed/stories failed", {
        requestId: getRequestId(req),
        route: "GET /api/feed/stories",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
