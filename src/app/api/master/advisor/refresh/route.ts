import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { refreshAdvisorInsights } from "@/lib/advisor/cache";

export const runtime = "nodejs";

const ADVISOR_REFRESH_RATE_LIMIT = {
  limit: 1,
  windowSeconds: 60 * 60,
};

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const allowed = await checkRateLimit(
      `rate:advisorRefresh:${user.id}`,
      ADVISOR_REFRESH_RATE_LIMIT.limit,
      ADVISOR_REFRESH_RATE_LIMIT.windowSeconds
    );
    if (!allowed) {
      return jsonFail(429, "Too many requests", "RATE_LIMITED");
    }
    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await refreshAdvisorInsights(masterId);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/advisor/refresh failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/advisor/refresh",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
