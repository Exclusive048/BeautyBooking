import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { searchCatalog } from "@/lib/catalog/catalog.service";
import { catalogSearchQuerySchema } from "@/lib/catalog/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { getClientIp } from "@/lib/http/ip";
import { getServerCity } from "@/lib/cities/server-city";

export const runtime = "nodejs";
const CATALOG_SEARCH_RATE_LIMIT = {
  windowSeconds: 60,
  maxRequests: 30,
};

export async function GET(req: Request) {
  try {
    const rateLimit = await checkRateLimit(
      routeRateLimitKey(req, "ip", getClientIp(req)),
      CATALOG_SEARCH_RATE_LIMIT
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const query = parseQuery(new URL(req.url), catalogSearchQuerySchema);
    // EXP-021: apply the user's selected city (cookie-resolved, same source
    // as `/models`). Absent cookie → null → catalog shows all cities.
    const city = await getServerCity();
    const data = await searchCatalog({ ...query, cityId: city?.id });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/catalog/search failed", {
        requestId: getRequestId(req),
        route: "GET /api/catalog/search",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

