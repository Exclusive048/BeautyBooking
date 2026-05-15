import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { suggestReviewReply } from "@/lib/ai/review-reply";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { reviewIdParamSchema } from "@/lib/reviews/schemas";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

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

    const enabled = await getAiFeaturesEnabled();
    if (!enabled) {
      return jsonFail(503, "AI features are disabled", "SYSTEM_FEATURE_DISABLED");
    }

    const limit = await checkRateLimit(
      `rl:ai:suggest-reply:${user.id}`,
      RATE_LIMITS.aiSuggestReply,
    );
    if (limit.limited) {
      return jsonFail(429, "Too many requests", "RATE_LIMITED");
    }

    const params = await ctx.params;
    const parsedParams = reviewIdParamSchema.safeParse(params);
    if (!parsedParams.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    // `findFirst` lets us combine the unique id with the soft-delete
    // filter — admin can still load deleted reviews via the admin
    // module, but AI suggest-reply should never operate on them.
    const review = await prisma.review.findFirst({
      where: { id: parsedParams.data.id, ...ACTIVE_REVIEW_FILTER },
      select: {
        id: true,
        text: true,
        rating: true,
        replyText: true,
        targetId: true,
        targetType: true,
        author: { select: { id: true, displayName: true } },
        booking: {
          select: {
            service: { select: { name: true, title: true } },
          },
        },
      },
    });

    if (!review) {
      return jsonFail(404, "Review not found", "NOT_FOUND");
    }

    if (review.replyText) {
      return jsonFail(400, "Review already has a reply", "ALREADY_EXISTS");
    }

    const provider = await prisma.provider.findFirst({
      where: { id: review.targetId },
      select: {
        ownerUserId: true,
        masterProfile: { select: { userId: true } },
      },
    });

    if (!provider) {
      return jsonFail(404, "Provider not found", "PROVIDER_NOT_FOUND");
    }

    const isOwner =
      provider.ownerUserId === user.id ||
      provider.masterProfile?.userId === user.id;

    if (!isOwner) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const suggestion = await suggestReviewReply({
      reviewText: review.text ?? "",
      rating: review.rating,
      clientName: review.author?.displayName ?? "",
      serviceName: review.booking?.service?.title ?? review.booking?.service?.name ?? "",
    });

    if (!suggestion) {
      return jsonFail(500, "Failed to generate suggestion", "INTERNAL_ERROR");
    }

    return jsonOk({ suggestion });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/reviews/[id]/suggest-reply failed", {
        requestId,
        route: "POST /api/reviews/{id}/suggest-reply",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
