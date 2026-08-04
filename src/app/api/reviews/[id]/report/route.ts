import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { reviewIdParamSchema, reviewReportSchema } from "@/lib/reviews/schemas";
import { reportReview } from "@/lib/reviews/service";
import { decodePublicId } from "@/lib/public-id";
import { parseBody } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    }

    const params = await ctx.params;
    const parsedParams = reviewIdParamSchema.safeParse(params);
    if (!parsedParams.success) {
      return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
    }

    const body = await parseBody(req, reviewReportSchema);
    const result = await reportReview({
      // RULE-12-REVIEWS (FIX-18): decode opaque token; raw cuids pass through.
      reviewId: decodePublicId(parsedParams.data.id),
      currentUserId: user.id,
      reason: body.reason,
      comment: body.comment,
    });

    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/reviews/[id]/report failed", {
        requestId,
        route: "POST /api/reviews/{id}/report",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
