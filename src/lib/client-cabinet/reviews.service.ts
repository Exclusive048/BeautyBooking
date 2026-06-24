import { BookingStatus, type Prisma, ReviewTargetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canLeaveReview, reviewWindowFor } from "@/lib/reviews/can-leave";
import { REVIEW_WINDOW_DAYS } from "@/lib/reviews/constants";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// FIX-R2-06-H: candidate set for "can leave a review" — runtime-FINISHED (any
// non-terminal status whose time has passed) within a coarse window; the exact
// gate (runtime-FINISHED + REVIEW_WINDOW_DAYS) is applied in-memory via
// `canLeaveReview`, the SAME predicate the server can-leave route uses.
export function reviewCandidateWhere(userId: string, now: Date): Prisma.BookingWhereInput {
  return {
    clientUserId: userId,
    status: {
      notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
    },
    endAtUtc: { not: null, lte: now, gte: new Date(now.getTime() - (REVIEW_WINDOW_DAYS + 1) * DAY_MS) },
    review: { is: null },
  };
}

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
  const now = new Date();

  const [agg, respondedCount, pendingCandidates] = await Promise.all([
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
    prisma.booking.findMany({
      where: reviewCandidateWhere(userId, now),
      select: {
        status: true,
        startAtUtc: true,
        endAtUtc: true,
        service: { select: { durationMin: true } },
      },
    }),
  ]);

  const pendingCount = pendingCandidates.filter((b) =>
    canLeaveReview({ booking: { ...b, clientUserId: userId }, currentUserId: userId, nowUtc: now }),
  ).length;

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
  const now = new Date();

  const rows = await prisma.booking.findMany({
    where: reviewCandidateWhere(userId, now),
    orderBy: { endAtUtc: "desc" },
    include: {
      service: { select: { durationMin: true } },
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

  return rows
    .filter((r) =>
      canLeaveReview({ booking: { ...r, clientUserId: userId }, currentUserId: userId, nowUtc: now }),
    )
    .slice(0, 10)
    .map((r) => {
      const window = reviewWindowFor(r);
      const daysLeft = window
        ? Math.max(0, Math.ceil((window.deadline.getTime() - now.getTime()) / DAY_MS))
        : 0;
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
