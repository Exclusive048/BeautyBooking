import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { homeFeedQuerySchema } from "@/lib/home/schemas";
import { parseQuery } from "@/lib/validation";
import { listHomePortfolioFeed } from "@/lib/feed/portfolio.service";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), homeFeedQuerySchema);
    const user = await getSessionUser();
    const data = await listHomePortfolioFeed({
      limit: query.limit,
      cursor: query.cursor,
      categoryId: query.categoryId,
      tagId: query.tagId,
      currentUserId: user?.id,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/home/feed failed", {
        requestId: getRequestId(req),
        route: "GET /api/home/feed",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
