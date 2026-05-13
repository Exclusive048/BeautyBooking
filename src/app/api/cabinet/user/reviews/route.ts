import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import {
  computeReviewsKpi,
  listClientReviews,
  listPendingReviewBookings,
} from "@/lib/client-cabinet/reviews.service";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const [reviews, kpi, pending] = await Promise.all([
      listClientReviews(user.id),
      computeReviewsKpi(user.id),
      listPendingReviewBookings(user.id),
    ]);

    return jsonOk({ reviews, kpi, pending });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cabinet/user/reviews failed", {
        requestId: getRequestId(req),
        route: "GET /api/cabinet/user/reviews",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
