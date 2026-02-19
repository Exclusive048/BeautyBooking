import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveAnalyticsContext } from "@/features/analytics";
import { parseScopeParams } from "@/features/analytics/api/routes";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const url = new URL(req.url);
    const { scope } = parseScopeParams(url);
    if (scope !== "STUDIO") {
      throw new AppError("Раздел доступен только для студии.", 403, "FORBIDDEN");
    }

    const context = await resolveAnalyticsContext({ userId: user.id, scope, masterId: null });

    const masters = await prisma.provider.findMany({
      where: { studioId: context.providerId, type: "MASTER" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return jsonOk({ masters });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/analytics/masters failed", {
        requestId: getRequestId(req),
        route: "GET /api/analytics/masters",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
