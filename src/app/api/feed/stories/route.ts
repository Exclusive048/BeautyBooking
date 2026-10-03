import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getActiveStoriesGroups } from "@/lib/feed/stories.service";
import { resolveCityParam } from "@/lib/cities/server-city";
import { cityQueryParamSchema } from "@/lib/cities/city-param";
import { parseQuery } from "@/lib/validation";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { viewerRateLimitKey } from "@/lib/rate-limit/subject";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

export const runtime = "nodejs";

/** MOBILE-B1: `?city=<slug>` — истории мастеров города; без него — все города. */
const storiesQuerySchema = z.object({ city: cityQueryParamSchema });

export async function GET(req: Request) {
  try {
    const rateLimit = await checkRateLimit(
      // MOBILE-B1: вошедший — ведро аккаунта, аноним — IP (CGNAT, `rate-limit/subject.ts`).
      viewerRateLimitKey(req),
      RATE_LIMITS.feedStories,
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const query = parseQuery(new URL(req.url), storiesQuerySchema);
    const city = await resolveCityParam(query.city);
    const data = await getActiveStoriesGroups({ cityId: city?.id });
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
