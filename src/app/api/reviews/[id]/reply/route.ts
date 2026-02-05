import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { reviewIdParamSchema, reviewReplySchema } from "@/lib/reviews/schemas";
import { replyToReview } from "@/lib/reviews/service";
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
