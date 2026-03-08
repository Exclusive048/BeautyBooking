import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { searchCatalog } from "@/lib/catalog/catalog.service";
import { catalogSearchQuerySchema } from "@/lib/catalog/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/http/ip";

export const runtime = "nodejs";
const CATALOG_SEARCH_RATE_LIMIT = {
  windowSeconds: 60,
  maxRequests: 30,
};

export async function GET(req: Request) {
  try {
    const rateLimit = await checkRateLimit(
      `rl:/api/catalog/search:ip:${getClientIp(req)}`,
      CATALOG_SEARCH_RATE_LIMIT
    );
    if (rateLimit.limited) {
      return jsonFail(429, "Too many requests", "RATE_LIMITED", {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
    }

    const query = parseQuery(new URL(req.url), catalogSearchQuerySchema);
    const data = await searchCatalog(query);
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

