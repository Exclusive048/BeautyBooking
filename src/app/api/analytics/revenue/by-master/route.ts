import { isDateKey } from "@/lib/schedule/dateKey";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError, AppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  ensureFeatureAccess,
  getRevenueByMaster,
  resolveAnalyticsContext,
  resolveRangeWithCompare,
} from "@/features/analytics";
import { parseScopeParams } from "@/features/analytics/api/routes";

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
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to || !isDateKey(from) || !isDateKey(to)) {
      return jsonFail(400, "Некорректный диапазон дат.", "VALIDATION_ERROR");
    }

    const context = await resolveAnalyticsContext({ userId: user.id, scope, masterId: null });
    await ensureFeatureAccess({ userId: user.id, scope: context.scope, feature: "analytics_revenue" });

    const { range } = resolveRangeWithCompare({
      period: "custom",
      timeZone: context.timeZone,
      from,
      to,
      compare: false,
    });

    const data = await getRevenueByMaster({ context, range });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/analytics/revenue/by-master failed", {
        requestId: getRequestId(req),
        route: "GET /api/analytics/revenue/by-master",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
