import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listPortfolioFeed } from "@/lib/feed/portfolio.service";
import { portfolioFeedQuerySchema } from "@/lib/feed/schemas";
import { parseQuery } from "@/lib/validation";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), portfolioFeedQuerySchema);
    const user = await getSessionUser();
    const data = await listPortfolioFeed({
      limit: query.limit,
      cursor: query.cursor,
      q: query.q,
      categoryId: query.categoryId ?? query.category,
      tag: query.tag,
      near: query.near,
      masterId: query.masterId,
      currentUserId: user?.id,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/feed/portfolio failed", {
        requestId: getRequestId(req),
        route: "GET /api/feed/portfolio",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
