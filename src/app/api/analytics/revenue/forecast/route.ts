import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  ensureFeatureAccess,
  getRevenueForecast,
  resolveAnalyticsContext,
  resolveMonthRange,
} from "@/features/analytics";
import { parseMonthParam, parseScopeParams } from "@/features/analytics/api/routes";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const url = new URL(req.url);
    const { scope, masterId } = parseScopeParams(url);
    const month = parseMonthParam(url);

    const context = await resolveAnalyticsContext({ userId: user.id, scope, masterId });
    await ensureFeatureAccess({ userId: user.id, scope: context.scope, feature: "analytics_forecast" });

    const range = resolveMonthRange({ month, timeZone: context.timeZone });
    const data = await getRevenueForecast({ context, month, range });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/analytics/revenue/forecast failed", {
        requestId: getRequestId(req),
        route: "GET /api/analytics/revenue/forecast",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
