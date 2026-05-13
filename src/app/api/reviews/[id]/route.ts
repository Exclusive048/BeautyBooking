import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { reviewIdParamSchema } from "@/lib/reviews/schemas";
import { deleteReview, updateReview } from "@/lib/reviews/service";
import { parseBody } from "@/lib/validation";

const updateReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const params = await ctx.params;
    const parsedParam = reviewIdParamSchema.safeParse(params);
    if (!parsedParam.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const body = await parseBody(req, updateReviewBodySchema);

    const result = await updateReview({
      reviewId: parsedParam.data.id,
      currentUser: { id: user.id, roles: user.roles },
      rating: body.rating,
      text: body.text,
    });

    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("PATCH /api/reviews/[id] failed", {
        requestId,
        route: "PATCH /api/reviews/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const params = await ctx.params;
    const parsed = reviewIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const result = await deleteReview({
      reviewId: parsed.data.id,
      currentUser: { id: user.id, roles: user.roles },
    });

    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("DELETE /api/reviews/[id] failed", {
        requestId,
        route: "DELETE /api/reviews/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
