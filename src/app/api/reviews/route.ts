import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { createReviewSchema, listReviewsQuerySchema } from "@/lib/reviews/schemas";
import { createReview, listReviews } from "@/lib/reviews/service";
import { loadReviewWithRelations, notifyReviewLeft } from "@/lib/notifications/review-notifications";
import { parseBody, parseQuery } from "@/lib/validation";
import type { ApiFieldErrors } from "@/lib/api/contracts";

// AUDIT (section 4):
// - GET resolves caller visibility and exposes privateTags only to master owner/admin.
export const runtime = "nodejs";

function extractFieldErrors(details: unknown): ApiFieldErrors | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const maybe = (details as { fieldErrors?: unknown }).fieldErrors;
  if (typeof maybe !== "object" || maybe === null) return undefined;
  return maybe as ApiFieldErrors;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const url = new URL(req.url);
    const query = parseQuery(url, listReviewsQuerySchema);
    const reviews = await listReviews({
      targetType: query.targetType,
      targetId: query.targetId,
      limit: query.limit,
      offset: query.offset,
      currentUser: user ? { id: user.id, roles: user.roles } : null,
    });
    return jsonOk({ reviews });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/reviews failed", {
        requestId,
        route: "GET /api/reviews",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(
      appError.status,
      appError.message,
      appError.code,
      appError.details,
      extractFieldErrors(appError.details)
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const body = await parseBody(req, createReviewSchema);
    const review = await createReview({
      currentUserId: user.id,
      bookingId: body.bookingId,
      rating: body.rating,
      text: body.text,
      publicTagIds: body.publicTagIds,
      privateTagIds: body.privateTagIds,
    });
    try {
      const fullReview = await loadReviewWithRelations(review.id);
      if (fullReview) {
        await notifyReviewLeft(fullReview);
      }
    } catch (error) {
      logError("POST /api/reviews notification failed", {
        requestId: getRequestId(req),
        route: "POST /api/reviews",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonOk({ review }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/reviews failed", {
        requestId,
        route: "POST /api/reviews",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(
      appError.status,
      appError.message,
      appError.code,
      appError.details,
      extractFieldErrors(appError.details)
    );
  }
}
