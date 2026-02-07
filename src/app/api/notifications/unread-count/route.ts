import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getUnreadBadgeCount } from "@/lib/notifications/badge";
import { getRequestId, logError } from "@/lib/logging/logger";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const data = await getUnreadBadgeCount({
      userId: user.id,
      phone: user.phone ?? null,
    });

    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/notifications/unread-count failed", {
        requestId: getRequestId(req),
        route: "GET /api/notifications/unread-count",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
