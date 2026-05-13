import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { clearReadNotifications } from "@/lib/notifications/service";

export const runtime = "nodejs";

/**
 * Soft-delete every read notification owned by the caller. Returns the
 * count for «Очищено N» feedback. Filter-agnostic — clears all read
 * notifications regardless of which category tab the user has active.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const result = await clearReadNotifications(user.id);
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/notifications/clear-read failed", {
        requestId: getRequestId(req),
        route: "POST /api/notifications/clear-read",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
