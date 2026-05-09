import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { reorderMasterPortfolio } from "@/lib/master/portfolio-mutations";
import { reorderMasterPortfolioSchema } from "@/lib/master/schemas";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const body = await parseBody(req, reorderMasterPortfolioSchema);
    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await reorderMasterPortfolio(masterId, body.itemId, body.direction);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/portfolio/reorder failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/portfolio/reorder",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
