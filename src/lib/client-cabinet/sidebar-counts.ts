import { cache } from "react";
import { BookingActionRequiredBy, BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canLeaveReview } from "@/lib/reviews/can-leave";
import { reviewCandidateWhere } from "@/lib/client-cabinet/reviews.service";
import { personalNotificationWhere } from "@/lib/notifications/groups";
import { countUnreadChatMessages } from "@/lib/chat/conversation-aggregator";

export type SidebarCounts = {
  favorites: number;
  upcomingBookings: number;
  unreadNotifications: number;
  pendingReviews: number;
  /**
   * NAV-ATTENTION-01 — записи, где ход за клиентом: мастер предложил перенос
   * (`CHANGE_REQUESTED` + `actionRequiredBy = CLIENT`), визит ещё впереди.
   */
  bookingsAwaitingClient: number;
  /** NAV-ATTENTION-01 — непрочитанные сообщения мастеров (`countUnreadChatMessages`). */
  unreadMessages: number;
};

/**
 * One-shot sidebar count loader for the client cabinet. Each metric is a cheap
 * indexed count() — they run in parallel and we cache through React's request
 * scope so a single navigation only pays once.
 *
 * Pending reviews = bookings the server's can-leave gate would accept a review
 * for (runtime-FINISHED + REVIEW_WINDOW_DAYS, no existing review) — FIX-R2-06-H,
 * shared `canLeaveReview` predicate, so the badge matches the bookings/reviews
 * surfaces exactly and disappears when a review is published or the window ends.
 */
export const getClientSidebarCounts = cache(
  async (userId: string): Promise<SidebarCounts> => {
    const now = new Date();

    const [
      favorites,
      upcomingBookings,
      unreadNotifications,
      pendingReviewCandidates,
      bookingsAwaitingClient,
      unreadMessages,
    ] =
      await Promise.all([
        prisma.userFavorite.count({ where: { userId } }),
        prisma.booking.count({
          where: {
            clientUserId: userId,
            status: {
              in: [
                BookingStatus.NEW,
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.PREPAID,
                BookingStatus.STARTED,
                BookingStatus.IN_PROGRESS,
                BookingStatus.CHANGE_REQUESTED,
              ],
            },
            startAtUtc: { gte: now },
          },
        }),
        // Personal context: exclude master-only notification types. Mirrors
        // the filter applied by the client cabinet notifications page
        // (`/api/notifications?context=personal`) and the TopBar bell
        // (`/api/notifications/unread-count?context=personal`). Without
        // this, a user who also has a master role would see master-context
        // unread notifications bump the client sidebar badge while the
        // page itself stayed empty (audit-confirmed mismatch).
        prisma.notification.count({
          where: {
            userId,
            isRead: false,
            deletedAt: null,
            // NOTIF-PERSONAL-AMBIGUOUS-01: то же условие, что у ленты и колокольчика.
            ...personalNotificationWhere(userId),
          },
        }),
        prisma.booking.findMany({
          where: reviewCandidateWhere(userId, now),
          select: {
            status: true,
            startAtUtc: true,
            endAtUtc: true,
            service: { select: { durationMin: true } },
          },
        }),
        prisma.booking.count({
          where: {
            clientUserId: userId,
            status: BookingStatus.CHANGE_REQUESTED,
            actionRequiredBy: BookingActionRequiredBy.CLIENT,
            startAtUtc: { gte: now },
          },
        }),
        countUnreadChatMessages({ userId, perspective: "CLIENT" }),
      ]);

    const pendingReviews = pendingReviewCandidates.filter((b) =>
      canLeaveReview({ booking: { ...b, clientUserId: userId }, currentUserId: userId, nowUtc: now }),
    ).length;

    return {
      favorites,
      upcomingBookings,
      unreadNotifications,
      pendingReviews,
      bookingsAwaitingClient,
      unreadMessages,
    };
  },
);
