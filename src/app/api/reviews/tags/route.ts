import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listReviewTags } from "@/lib/reviews/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const data = await listReviewTags();
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/reviews/tags failed", {
        requestId: getRequestId(req),
        route: "GET /api/reviews/tags",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
