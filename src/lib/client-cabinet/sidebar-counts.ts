import { cache } from "react";
import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MASTER_NOTIFICATION_TYPES } from "@/lib/notifications/groups";

export type SidebarCounts = {
  favorites: number;
  upcomingBookings: number;
  unreadNotifications: number;
  pendingReviews: number;
};

/**
 * One-shot sidebar count loader for the client cabinet. Each metric is a cheap
 * indexed count() — they run in parallel and we cache through React's request
 * scope so a single navigation only pays once.
 *
 * Pending reviews = FINISHED bookings in the last 14 days that don't yet have
 * a Review row authored by the client. Mirrors the 14-day review window so
 * the badge disappears the moment a review is published.
 */
export const getClientSidebarCounts = cache(
  async (userId: string): Promise<SidebarCounts> => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const [favorites, upcomingBookings, unreadNotifications, pendingReviews] =
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
            type: { notIn: MASTER_NOTIFICATION_TYPES },
          },
        }),
        prisma.booking.count({
          where: {
            clientUserId: userId,
            status: BookingStatus.FINISHED,
            endAtUtc: { gte: fourteenDaysAgo },
            review: { is: null },
          },
        }),
      ]);

    return {
      favorites,
      upcomingBookings,
      unreadNotifications,
      pendingReviews,
    };
  },
);
