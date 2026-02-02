import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { canLeaveQuerySchema } from "@/lib/reviews/schemas";
import { canLeaveReviewForBooking } from "@/lib/reviews/service";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const url = new URL(req.url);
    const query = parseQuery(url, canLeaveQuerySchema);
    const canLeave = await canLeaveReviewForBooking({
      currentUserId: user.id,
      bookingId: query.bookingId,
    });
    return jsonOk({ canLeave });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/reviews/can-leave failed", {
        requestId,
        route: "GET /api/reviews/can-leave",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

