import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listStoriesMasters } from "@/lib/feed/stories.service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const masters = await listStoriesMasters();
    return jsonOk({ masters });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/home/stories failed", {
        requestId: getRequestId(req),
        route: "GET /api/home/stories",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
