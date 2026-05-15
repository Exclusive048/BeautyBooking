import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import {
  AdminDeleteReviewError,
  deleteReview,
} from "@/features/admin-cabinet/reviews/server/delete-review.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Hard delete of a review (review row removed + target ratings
 * recalculated). Mirrors the existing `DELETE /api/admin/reviews/[id]`
 * semantics but accepts a `reason` field for the audit log entry.
 *
 * **Hard delete approved** per the ADMIN-REVIEWS-A scope decision —
 * `Review.deletedAt` doesn't exist yet, and migrating to soft delete
 * is tracked in BACKLOG 🔴 as a pre-launch blocker.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Не указан id отзыва", 400, "VALIDATION_ERROR");

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return fail("Некорректные данные", 400, "VALIDATION_ERROR");
    }

    const result = await deleteReview({
      adminUserId: auth.user.id,
      reviewId: id,
      reason: parsed.data.reason ?? null,
      context: getAdminAuditContext(req),
    });
    return ok({ review: result });
  } catch (error) {
    if (error instanceof AdminDeleteReviewError) {
      return fail(error.message, 404, error.code);
    }
    logError("admin.reviews.delete failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Не удалось удалить отзыв", 500, "ADMIN_DELETE_REVIEW_FAILED");
  }
}
