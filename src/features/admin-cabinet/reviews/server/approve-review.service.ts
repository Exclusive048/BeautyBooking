import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import {
  EMPTY_ADMIN_AUDIT_CONTEXT,
  type AdminAuditContext,
} from "@/lib/audit/admin-audit-context";
import { logInfo } from "@/lib/logging/logger";

type ApproveInput = {
  adminUserId: string;
  reviewId: string;
  context?: AdminAuditContext;
};

export class AdminApproveReviewError extends Error {
  constructor(
    public readonly code: "REVIEW_NOT_FOUND" | "NOT_REPORTED",
    message: string,
  ) {
    super(message);
    this.name = "AdminApproveReviewError";
  }
}

/**
 * Admin "dismiss report" — clears the three report fields and
 * restores the review to its normal public state.
 *
 * No dedicated audit table exists in the schema for moderation
 * decisions (BACKLOG 🟠 — `AdminAuditLog`). Until that lands we
 * persist the decision via `logInfo` with a stable structured
 * shape so it can be reconstructed from logs.
 */
export async function approveReview(
  input: ApproveInput,
): Promise<{ reviewId: string }> {
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: {
      id: true,
      reportedAt: true,
      reportReason: true,
      reportComment: true,
    },
  });
  if (!review) {
    throw new AdminApproveReviewError(
      "REVIEW_NOT_FOUND",
      "Отзыв не найден",
    );
  }
  if (!review.reportedAt) {
    throw new AdminApproveReviewError(
      "NOT_REPORTED",
      "Отзыв не помечен как жалоба",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: review.id },
      data: {
        reportedAt: null,
        reportReason: null,
        reportComment: null,
      },
    });

    await createAdminAuditLog({
      tx,
      adminUserId: input.adminUserId,
      action: "REVIEW_APPROVED",
      targetType: "review",
      targetId: review.id,
      details: { previousReason: review.reportReason },
      context: input.context ?? EMPTY_ADMIN_AUDIT_CONTEXT,
    });
  });

  logInfo("admin.reviews.approved", {
    adminUserId: input.adminUserId,
    reviewId: review.id,
    previousReason: review.reportReason,
  });

  return { reviewId: review.id };
}
