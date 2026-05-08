import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { reviewIdParamSchema, reviewReplySchema } from "@/lib/reviews/schemas";
import { editReviewReply, replyToReview } from "@/lib/reviews/service";
import { loadReviewWithRelations, notifyReviewReplied } from "@/lib/notifications/review-notifications";
import { parseBody } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const params = await ctx.params;
    const parsedParams = reviewIdParamSchema.safeParse(params);
    if (!parsedParams.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const body = await parseBody(req, reviewReplySchema);
    const review = await replyToReview({
      reviewId: parsedParams.data.id,
      currentUserId: user.id,
      text: body.text,
    });

    try {
      const fullReview = await loadReviewWithRelations(review.id);
      if (fullReview) {
        await notifyReviewReplied(fullReview);
      }
    } catch (error) {
      logError("POST /api/reviews/[id]/reply notification failed", {
        requestId: getRequestId(req),
        route: "POST /api/reviews/{id}/reply",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    return jsonOk({ review });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/reviews/[id]/reply failed", {
        requestId,
        route: "POST /api/reviews/{id}/reply",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

/**
 * Edit an existing reply on a review (28a). Companion to the POST above
 * — POST creates the first reply (refusing if one already exists), PATCH
 * overwrites that reply and updates `repliedAt`. Surfaces in the master
 * cabinet's reviews page when the reply form opens with text pre-filled.
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const params = await ctx.params;
    const parsedParams = reviewIdParamSchema.safeParse(params);
    if (!parsedParams.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const body = await parseBody(req, reviewReplySchema);
    const review = await editReviewReply({
      reviewId: parsedParams.data.id,
      currentUserId: user.id,
      text: body.text,
    });

    return jsonOk({ review });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("PATCH /api/reviews/[id]/reply failed", {
        requestId,
        route: "PATCH /api/reviews/{id}/reply",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
