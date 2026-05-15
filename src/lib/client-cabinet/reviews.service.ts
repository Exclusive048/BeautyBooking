import { BookingStatus, ReviewTargetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

export type ClientReviewItem = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  hasReply: boolean;
  replyText: string | null;
  repliedAt: string | null;
  target: {
    type: "MASTER" | "STUDIO";
    id: string;
    name: string;
    avatarUrl: string | null;
    publicUsername: string | null;
  };
  bookingId: string | null;
  serviceName: string | null;
};

export type ClientReviewsKpi = {
  total: number;
  averageRating: number | null;
  respondedCount: number;
  pendingCount: number;
};

export type PendingReviewBooking = {
  bookingId: string;
  serviceName: string | null;
  endAtUtc: string;
  daysLeft: number;
  target: {
    type: "MASTER" | "STUDIO";
    id: string;
    name: string;
    avatarUrl: string | null;
    publicUsername: string | null;
  };
};

export async function listClientReviews(userId: string): Promise<ClientReviewItem[]> {
  const rows = await prisma.review.findMany({
    where: { authorId: userId, ...ACTIVE_REVIEW_FILTER },
    orderBy: { createdAt: "desc" },
    include: {
      master: {
        select: { id: true, name: true, avatarUrl: true, publicUsername: true },
      },
      studio: {
        select: {
          provider: {
            select: { id: true, name: true, avatarUrl: true, publicUsername: true },
          },
        },
      },
      booking: {
        select: {
          id: true,
          serviceItems: {
            select: { titleSnapshot: true },
            take: 1,
          },
        },
      },
    },
  });

  const now = Date.now();
  return rows.map((r) => {
    const targetType = r.targetType === ReviewTargetType.studio ? "STUDIO" : "MASTER";
    const targetData =
      targetType === "STUDIO"
        ? r.studio?.provider
        : r.master ?? null;

    return {
      id: r.id,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      canEdit: now - r.createdAt.getTime() < EDIT_WINDOW_MS,
      hasReply: !!r.replyText,
      replyText: r.replyText,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      target: {
        type: targetType,
        id: targetData?.id ?? r.targetId,
        name: targetData?.name ?? "—",
        avatarUrl: targetData?.avatarUrl ?? null,
        publicUsername: targetData?.publicUsername ?? null,
      },
      bookingId: r.booking?.id ?? null,
      serviceName: r.booking?.serviceItems[0]?.titleSnapshot ?? null,
    };
  });
}

export async function computeReviewsKpi(userId: string): Promise<ClientReviewsKpi> {
  const fourteenDaysAgo = new Date(Date.now() - FOURTEEN_DAYS_MS);

  const [agg, respondedCount, pendingCount] = await Promise.all([
    prisma.review.aggregate({
      where: { authorId: userId, ...ACTIVE_REVIEW_FILTER },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.review.count({
      where: {
        authorId: userId,
        replyText: { not: null },
        ...ACTIVE_REVIEW_FILTER,
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
    total: agg._count._all,
    averageRating: agg._avg.rating,
    respondedCount,
    pendingCount,
  };
}

export async function listPendingReviewBookings(
  userId: string,
): Promise<PendingReviewBooking[]> {
  const fourteenDaysAgo = new Date(Date.now() - FOURTEEN_DAYS_MS);

  const rows = await prisma.booking.findMany({
    where: {
      clientUserId: userId,
      status: BookingStatus.FINISHED,
      endAtUtc: { gte: fourteenDaysAgo, not: null },
      review: { is: null },
    },
    orderBy: { endAtUtc: "desc" },
    take: 10,
    include: {
      provider: {
        select: {
          id: true,
          type: true,
          name: true,
          avatarUrl: true,
          publicUsername: true,
        },
      },
      serviceItems: { select: { titleSnapshot: true }, take: 1 },
    },
  });

  const now = Date.now();
  return rows
    .filter((r) => r.endAtUtc)
    .map((r) => {
      const endMs = r.endAtUtc!.getTime();
      const elapsed = now - endMs;
      const daysLeft = Math.max(0, Math.ceil((FOURTEEN_DAYS_MS - elapsed) / (24 * 60 * 60 * 1000)));
      return {
        bookingId: r.id,
        serviceName: r.serviceItems[0]?.titleSnapshot ?? null,
        endAtUtc: r.endAtUtc!.toISOString(),
        daysLeft,
        target: {
          type: r.provider.type === "STUDIO" ? "STUDIO" : "MASTER",
          id: r.provider.id,
          name: r.provider.name,
          avatarUrl: r.provider.avatarUrl,
          publicUsername: r.provider.publicUsername,
        },
      };
    });
}
