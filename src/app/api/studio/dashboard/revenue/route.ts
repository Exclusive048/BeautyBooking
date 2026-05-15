import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { buildRevenueChart } from "@/features/studio-cabinet/dashboard/server/dashboard-data.service";
import {
  isStudioDashboardPeriodId,
  type StudioDashboardPeriodId,
} from "@/features/studio-cabinet/dashboard/lib/period-options";

export const runtime = "nodejs";

function hasAdminRole(roles: StudioRole[]) {
  return roles.some((role) => role === StudioRole.ADMIN || role === StudioRole.OWNER);
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const access = await resolveCurrentStudioAccess(user.id);
    if (!hasAdminRole(access.roles)) {
      return jsonFail(403, "Недостаточно прав.", "FORBIDDEN");
    }

    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get("period") ?? "30d";
    const period: StudioDashboardPeriodId = isStudioDashboardPeriodId(rawPeriod)
      ? rawPeriod
      : "30d";

    const data = await buildRevenueChart(access.studioId, period);
    return jsonOk({ data, period });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/dashboard/revenue failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/dashboard/revenue",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
