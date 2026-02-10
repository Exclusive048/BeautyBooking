import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listHomeTags } from "@/lib/home/home.service";
import { homeTagsQuerySchema } from "@/lib/home/schemas";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), homeTagsQuerySchema);
    const tags = await listHomeTags(query.categoryId);
    return jsonOk({ tags });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/home/tags failed", {
        requestId: getRequestId(req),
        route: "GET /api/home/tags",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
