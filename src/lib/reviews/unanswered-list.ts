import { ReviewTargetType } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type UnansweredReviewRow = {
  id: string;
  authorName: string;
  rating: number;
  text: string | null;
  createdAt: Date;
};

/**
 * Top-N unanswered reviews for the master. Used by the dashboard "Требуют
 * внимания" column. Excludes reported reviews — they live in their own
 * moderation flow.
 */
export const getUnansweredReviewsForMaster = cache(
  async (masterProviderId: string, limit = 2): Promise<UnansweredReviewRow[]> => {
    const rows = await prisma.review.findMany({
      where: {
        targetType: ReviewTargetType.provider,
        targetId: masterProviderId,
        replyText: null,
        reportedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        rating: true,
        text: true,
        createdAt: true,
        author: { select: { displayName: true, firstName: true } },
      },
    });
    return rows.map((row) => {
      const authorName =
        row.author.displayName?.trim() || row.author.firstName?.trim() || "Клиент";
      return {
        id: row.id,
        authorName,
        rating: row.rating,
        text: row.text,
        createdAt: row.createdAt,
      };
    });
  },
);
