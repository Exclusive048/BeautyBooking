import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listHomeCategories } from "@/lib/home/home.service";
import { toAppError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const categories = await listHomeCategories();
    return jsonOk({ categories });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/home/categories failed", {
        requestId: getRequestId(req),
        route: "GET /api/home/categories",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
