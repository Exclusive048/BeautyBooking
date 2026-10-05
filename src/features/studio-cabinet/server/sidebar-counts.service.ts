import { studioReviewsWhere } from "@/lib/reviews/studio-scope";
import { ScheduleChangeRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStudioNotificationCounts } from "@/lib/notifications/studio-feed";
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
 *
 * MOBILE-POLISH: `notificationsUnread` — канал студии (`getStudioNotificationCounts`:
 * непрочитанные уведомления студии + ожидающие заявки на график), как лента
 * `/cabinet/studio/notifications`, на которую ведёт пункт, и бейдж приложения
 * (`GET /api/cabinet/studio/context`). Раньше здесь считались ЛИЧНЫЕ
 * уведомления (`context: "personal"`) — веб и приложение расходились.
 */
export async function getStudioSidebarCounts(input: {
  studioId: string;
  userId: string;
}): Promise<StudioSidebarCounts> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  const [scheduleRequestsPending, reviewsUnanswered, notifications] = await Promise.all([
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
    getStudioNotificationCounts(input.userId),
  ]);

  return {
    scheduleRequestsPending,
    reviewsUnanswered,
    notificationsUnread: notifications.unreadCount,
  };
}
