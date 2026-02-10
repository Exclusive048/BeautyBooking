import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { hasAdminRole } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { runHotSlotsJob } from "@/lib/hot-slots/job";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");
    if (!hasAdminRole(user)) return jsonFail(403, "Доступ запрещён.", "FORBIDDEN");

    const stats = await runHotSlotsJob();
    return jsonOk({ stats });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/admin/hot-slots/run failed", {
        requestId: getRequestId(req),
        route: "POST /api/admin/hot-slots/run",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
