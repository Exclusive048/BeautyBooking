import "server-only";

import {
  NotificationType,
  ReviewTargetType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import {
  EMPTY_ADMIN_AUDIT_CONTEXT,
  type AdminAuditContext,
} from "@/lib/audit/admin-audit-context";
import { logError, logInfo } from "@/lib/logging/logger";
import { dispatchAdminInitiatedNotification } from "@/lib/notifications/admin-initiated";
import { buildReviewDeletedByAdminBody } from "@/lib/notifications/admin-body-templates";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

type DeleteInput = {
  adminUserId: string;
  reviewId: string;
  reason?: string | null;
  context?: AdminAuditContext;
};

export class AdminDeleteReviewError extends Error {
  constructor(
    public readonly code: "REVIEW_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AdminDeleteReviewError";
  }
}

/**
 * Recomputes `Provider.ratingAvg` / `ratingCount` (+ legacy `rating`
 * / `reviews` mirror fields) after a review delete. Same logic as
 * the legacy `/api/admin/reviews/[id]` DELETE endpoint, extracted
 * here so the new admin UI flow keeps target ratings consistent.
 *
 * Wrapped in a TransactionClient so the caller can run the
 * recalculate atomically with the `review.delete`.
 *
 * Soft-deleted reviews are excluded from the aggregate — the freshly
 * deleted row will already carry `deletedAt: now` by the time we run
 * this, so it drops out of `ratingAvg`/`ratingCount` without needing
 * a special case.
 */
async function recalculateTargetRatings(
  tx: Prisma.TransactionClient,
  targetType: ReviewTargetType,
  targetId: string,
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: { targetType, targetId, ...ACTIVE_REVIEW_FILTER },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const ratingAvg = aggregate._avg.rating ?? 0;
  const ratingCount = aggregate._count._all ?? 0;
  try {
    await tx.provider.update({
      where: { id: targetId },
      data: {
        ratingAvg,
        ratingCount,
        rating: ratingAvg,
        reviews: ratingCount,
      },
    });
  } catch {
    // provider may not exist for studio target type — same defensive
    // pattern as the legacy endpoint
  }
}

/**
 * Soft delete a review (REVIEW-SOFT-DELETE-A, 2026-05-14). Sets
 * `deletedAt` / `deletedByUserId` / `deletedReason` on the row and
 * recomputes the target's rating fields (the freshly-deleted row
 * drops out of the aggregate via `ACTIVE_REVIEW_FILTER`).
 *
 * **Idempotent:** re-deleting an already soft-deleted review is a
 * no-op — no second audit row, no second notification, no rating
 * recalc. This makes the admin UI tolerant of double-clicks and
 * lets retry-after-network-blip behave predictably.
 *
 * **Restoration:** there is no UI flow. Reviving a review is a
 * manual `UPDATE Review SET deletedAt = NULL WHERE id = ?` that the
 * operator runs against the database. The next rating-affecting
 * action on that target will pull the row back into the aggregate.
 *
 * Transactional: update + target-rating recalculation + audit log
 * all run inside a single transaction. Notification dispatch happens
 * after commit (matches the existing `dispatchAdminInitiatedNotification`
 * convention and lets the in-app row + push + Telegram fan out without
 * holding the transaction open).
 */
export async function deleteReview(
  input: DeleteInput,
): Promise<{ reviewId: string; alreadyDeleted: boolean }> {
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: {
      id: true,
      authorId: true,
      rating: true,
      targetType: true,
      targetId: true,
      reportedAt: true,
      reportReason: true,
      deletedAt: true,
      master: { select: { name: true } },
      studio: { select: { provider: { select: { name: true } } } },
    },
  });
  if (!review) {
    throw new AdminDeleteReviewError(
      "REVIEW_NOT_FOUND",
      "Отзыв не найден",
    );
  }

  if (review.deletedAt) {
    // Idempotent: already deleted. Log and return without re-running
    // audit / notification / rating recalc.
    logInfo("admin.reviews.deleted.idempotent_skip", {
      adminUserId: input.adminUserId,
      reviewId: review.id,
      deletedAt: review.deletedAt.toISOString(),
    });
    return { reviewId: review.id, alreadyDeleted: true };
  }

  const targetName =
    review.targetType === ReviewTargetType.provider
      ? review.master?.name ?? null
      : review.studio?.provider?.name ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: review.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: input.adminUserId,
        deletedReason: input.reason?.trim() || null,
      },
    });
    await recalculateTargetRatings(tx, review.targetType, review.targetId);

    await createAdminAuditLog({
      tx,
      adminUserId: input.adminUserId,
      action: "REVIEW_DELETED",
      targetType: "review",
      targetId: review.id,
      details: {
        reviewTargetType: review.targetType,
        reviewTargetId: review.targetId,
        rating: review.rating,
        wasReported: review.reportedAt !== null,
        reportReason: review.reportReason,
      },
      reason: input.reason?.trim() || null,
      context: input.context ?? EMPTY_ADMIN_AUDIT_CONTEXT,
    });
  });

  logInfo("admin.reviews.deleted", {
    adminUserId: input.adminUserId,
    reviewId: review.id,
    targetType: review.targetType,
    targetId: review.targetId,
    rating: review.rating,
    wasReported: review.reportedAt !== null,
    reportReason: review.reportReason,
    reason: input.reason?.trim() || null,
  });

  // Notify the review author that their content was removed. `authorId`
  // is non-nullable on Review, so we always have a recipient; the
  // try/catch shields the admin action from notification failures.
  try {
    await dispatchAdminInitiatedNotification({
      targetUserId: review.authorId,
      type: NotificationType.REVIEW_DELETED_BY_ADMIN,
      title: "Ваш отзыв удалён",
      body: buildReviewDeletedByAdminBody({
        targetName,
        reason: input.reason ?? null,
      }),
      url: "/cabinet/reviews",
      payload: {
        reviewId: review.id,
        targetType: review.targetType,
        targetId: review.targetId,
      },
    });
  } catch (error) {
    logError("admin.reviews.deleted.notify_failed", {
      adminUserId: input.adminUserId,
      reviewId: review.id,
      authorId: review.authorId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { reviewId: review.id, alreadyDeleted: false };
}
