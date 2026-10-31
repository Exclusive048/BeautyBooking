import { studioReviewsWhere } from "@/lib/reviews/studio-scope";
import { ScheduleChangeRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStudioNotificationCounts } from "@/lib/notifications/studio-feed";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { countUnreadChatMessages } from "@/lib/chat/conversation-aggregator";
import { isStudioSideUser } from "@/lib/chat/studio-side";

export type StudioSidebarCounts = {
  scheduleRequestsPending: number;
  reviewsUnanswered: number;
  notificationsUnread: number;
  /** STUDIO-CHAT: непрочитанные сообщения клиентов студии; 0 — мастеру студии. */
  messagesUnread: number;
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
  const [scheduleRequestsPending, reviewsUnanswered, notifications, messagesUnread] = await Promise.all([
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
    countStudioUnreadMessages(input.userId, studio?.providerId ?? null),
  ]);

  return {
    scheduleRequestsPending,
    reviewsUnanswered,
    notificationsUnread: notifications.unreadCount,
    messagesUnread,
  };
}

/**
 * STUDIO-CHAT: переписку студии читают только владелец и администраторы
 * (`chat/studio-side.ts`), поэтому мастеру студии счётчик не считается.
 */
async function countStudioUnreadMessages(
  userId: string,
  studioProviderId: string | null,
): Promise<number> {
  if (!studioProviderId) return 0;
  if (!(await isStudioSideUser(userId, studioProviderId))) return 0;
  return countUnreadChatMessages({ userId, perspective: "STUDIO", studioProviderId });
}
