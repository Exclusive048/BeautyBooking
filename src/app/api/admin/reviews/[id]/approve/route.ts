import { fail, ok } from "@/lib/api/response";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import {
  AdminApproveReviewError,
  approveReview,
} from "@/features/admin-cabinet/reviews/server/approve-review.service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Dismiss a report on a review (clears `reportedAt` / `reportReason` /
 * `reportComment` so the review returns to its public state).
 * Same effect as the legacy `PATCH /api/admin/reviews/[id]` with
 * `{action: "dismiss_report"}` body, but exposed as a dedicated
 * verb-named route and with `logInfo` audit until a proper admin
 * audit table lands (BACKLOG 🟠).
 */
export async function POST(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Не указан id отзыва", 400, "VALIDATION_ERROR");

    const result = await approveReview({
      adminUserId: auth.user.id,
      reviewId: id,
      context: getAdminAuditContext(req),
    });
    return ok({ review: result });
  } catch (error) {
    if (error instanceof AdminApproveReviewError) {
      const status = error.code === "REVIEW_NOT_FOUND" ? 404 : 400;
      return fail(error.message, status, error.code);
    }
    logError("admin.reviews.approve failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Не удалось одобрить отзыв", 500, "ADMIN_APPROVE_REVIEW_FAILED");
  }
}
