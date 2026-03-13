import { listProviders } from "@/lib/providers/usecases";
import { providerListQuerySchema } from "@/lib/providers/schemas";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), providerListQuerySchema);
    const result = await listProviders({
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/providers failed", {
        requestId,
        route: "GET /api/providers",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
