import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { availabilitySearchQuerySchema } from "@/lib/search-by-time/schemas";
import { searchAvailabilityByTime } from "@/lib/search-by-time/service";
import { resolveCityParam } from "@/lib/cities/server-city";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), availabilitySearchQuerySchema);
    // MOBILE-B1: `?city=<slug>` — только провайдеры города. Веб сюда город не
    // передаёт (и куку здесь не читаем — поведение веба прежнее).
    const city = await resolveCityParam(query.city);
    const data = await searchAvailabilityByTime({ ...query, cityId: city?.id });
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
      appError.code === "VALIDATION_ERROR" ? "Проверьте дату и время поиска." : appError.message;
    return jsonFail(appError.status, message, appError.code, appError.details);
  }
}
