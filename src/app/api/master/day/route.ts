import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterDay } from "@/lib/master/day.service";
import { masterDayQuerySchema } from "@/lib/master/schemas";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const query = parseQuery(new URL(req.url), masterDayQuerySchema);
    const masterId = await getCurrentMasterProviderId(user.id);

    const data = await getMasterDay({ masterId, date: query.date });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/day failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/day",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

