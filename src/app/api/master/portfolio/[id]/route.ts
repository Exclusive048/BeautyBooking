import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { deleteMasterPortfolioItem } from "@/lib/master/profile.service";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await deleteMasterPortfolioItem(masterId, id);
    return jsonOk(data);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return jsonOk({ deleted: true });
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/master/portfolio/[id] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/master/portfolio/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
