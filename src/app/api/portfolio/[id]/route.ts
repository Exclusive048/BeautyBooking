import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getPortfolioDetail } from "@/lib/feed/portfolio.service";
import { getSessionUser } from "@/lib/auth/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const user = await getSessionUser();
    const data = await getPortfolioDetail(id, user?.id);
    return jsonOk({ item: data });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/portfolio/[id] failed", {
        requestId: getRequestId(req),
        route: "GET /api/portfolio/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
