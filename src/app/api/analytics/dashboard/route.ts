import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  getDashboardKpi,
  getRevenueTimeline,
  resolveRangeWithCompare,
  ensureFeatureAccess,
  resolveAnalyticsContext,
} from "@/features/analytics";
import { parsePeriodParams, parseScopeParams } from "@/features/analytics/api/routes";

export const runtime = "nodejs";

function pickGranularity(period: string) {
  if (period === "today" || period === "week") return "day";
  if (period === "month") return "week";
  return "month";
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const url = new URL(req.url);
    const { scope, masterId } = parseScopeParams(url);
    const period = parsePeriodParams(url);

    const context = await resolveAnalyticsContext({ userId: user.id, scope, masterId });
    await ensureFeatureAccess({ userId: user.id, scope: context.scope, feature: "analytics_dashboard" });

    const { range, prevRange } = resolveRangeWithCompare({
      period: period.period,
      timeZone: context.timeZone,
      from: period.from ?? null,
      to: period.to ?? null,
      compare: period.compare,
    });

    const [kpi, timeline] = await Promise.all([
      getDashboardKpi({ context, range, prevRange }),
      getRevenueTimeline({
        context,
        range,
        granularity: pickGranularity(period.period),
      }),
    ]);

    return jsonOk({
      range: { from: range.fromKey, to: range.toKey },
      compareRange: prevRange ? { from: prevRange.fromKey, to: prevRange.toKey } : null,
      kpi: kpi.kpi,
      occupancy: kpi.occupancy,
      revenueTimeline: timeline,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/analytics/dashboard failed", {
        requestId: getRequestId(req),
        route: "GET /api/analytics/dashboard",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
