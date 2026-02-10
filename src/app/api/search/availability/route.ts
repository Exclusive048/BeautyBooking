import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { availabilitySearchQuerySchema } from "@/lib/search-by-time/schemas";
import { searchAvailabilityByTime } from "@/lib/search-by-time/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), availabilitySearchQuerySchema);
    const data = await searchAvailabilityByTime(query);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/search/availability failed", {
        requestId: getRequestId(req),
        route: "GET /api/search/availability",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    const message =
      appError.code === "VALIDATION_ERROR" ? "Некорректные параметры запроса" : appError.message;
    return jsonFail(appError.status, message, appError.code, appError.details);
  }
}
