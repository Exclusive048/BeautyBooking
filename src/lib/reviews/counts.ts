import { ReviewTargetType } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Reviews left for this master that haven't received a reply yet. Drives
 * the "Отзывы" sidebar badge. `replyText: null` works for both empty
 * strings (which the API normalises to null) and never-answered rows.
 */
export const getUnansweredReviewsCountForMaster = cache(
  async (masterProviderId: string): Promise<number> => {
    return prisma.review.count({
      where: {
        targetType: ReviewTargetType.provider,
        targetId: masterProviderId,
        replyText: null,
        reportedAt: null,
      },
    });
  },
);
