import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { searchCatalog } from "@/lib/catalog/catalog.service";
import { catalogSearchQuerySchema } from "@/lib/catalog/schemas";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
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

