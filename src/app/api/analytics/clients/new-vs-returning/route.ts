import { isDateKey } from "@/lib/schedule/dateKey";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  ensureFeatureAccess,
  getNewVsReturning,
  resolveAnalyticsContext,
  resolveRangeWithCompare,
} from "@/features/analytics";
import { parseGranularityParam, parseScopeParams } from "@/features/analytics/api/routes";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const url = new URL(req.url);
    const { scope, masterId } = parseScopeParams(url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to || !isDateKey(from) || !isDateKey(to)) {
      return jsonFail(400, "Некорректный диапазон дат.", "VALIDATION_ERROR");
    }
    const granularity = parseGranularityParam(url, "day");

    const context = await resolveAnalyticsContext({ userId: user.id, scope, masterId });
    await ensureFeatureAccess({ userId: user.id, scope: context.scope, feature: "analytics_clients" });

    const { range } = resolveRangeWithCompare({
      period: "custom",
      timeZone: context.timeZone,
      from,
      to,
      compare: false,
    });

    const data = await getNewVsReturning({ context, range, granularity });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/analytics/clients/new-vs-returning failed", {
        requestId: getRequestId(req),
        route: "GET /api/analytics/clients/new-vs-returning",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
