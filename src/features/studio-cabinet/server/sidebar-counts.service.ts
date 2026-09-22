import { studioReviewsWhere } from "@/lib/reviews/studio-scope";
import { ScheduleChangeRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUnreadBadgeCount } from "@/lib/notifications/badge";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

export type StudioSidebarCounts = {
  scheduleRequestsPending: number;
  reviewsUnanswered: number;
  notificationsUnread: number;
};

/**
 * Resolves the three badge counts surfaced in the Cabinet Studio
 * sidebar. All three queries run in parallel — no caching layer yet,
 * acceptable since each is a small indexed count. If this becomes a
 * latency hotspot, wrap callers in `React.cache` per render or add a
 * short Redis TTL.
 */
export async function getStudioSidebarCounts(input: {
  studioId: string;
  userId: string;
  phone: string | null;
}): Promise<StudioSidebarCounts> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  const [scheduleRequestsPending, reviewsUnanswered, badge] = await Promise.all([
    prisma.scheduleChangeRequest.count({
      where: { studioId: input.studioId, status: ScheduleChangeRequestStatus.PENDING },
    }),
    prisma.review.count({
      where: {
        // STUDIO-REVIEWS-SCOPE-01
        ...(studio ? studioReviewsWhere(studio) : { studioId: input.studioId }),
        replyText: null,
        reportedAt: null,
        ...ACTIVE_REVIEW_FILTER,
      },
    }),
    getUnreadBadgeCount({ userId: input.userId, phone: input.phone, context: "personal" }),
  ]);

  return {
    scheduleRequestsPending,
    reviewsUnanswered,
    notificationsUnread: badge.count,
  };
}
