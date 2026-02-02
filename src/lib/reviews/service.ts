import { Prisma, type ReviewTargetType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { canLeaveReview } from "@/lib/reviews/can-leave";
import { toReviewDto, type ReviewDto } from "@/lib/reviews/types";

type BookingForCreate = Prisma.BookingGetPayload<{
  select: {
    id: true;
    clientUserId: true;
    status: true;
    startAtUtc: true;
    endAtUtc: true;
    service: { select: { durationMin: true } };
    provider: { select: { id: true; type: true } };
  };
}>;

function requireReviewTarget(booking: BookingForCreate): { targetType: ReviewTargetType; targetId: string } {
  if (booking.provider.type === "MASTER") {
    return { targetType: "provider", targetId: booking.provider.id };
  }
  if (booking.provider.type === "STUDIO") {
    return { targetType: "studio", targetId: booking.provider.id };
  }
  throw new AppError("Review target not found", 404, "REVIEW_TARGET_NOT_FOUND");
}

async function recalculateTargetRatings(
  tx: Prisma.TransactionClient,
  targetType: ReviewTargetType,
  targetId: string
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: { targetType, targetId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const ratingAvg = aggregate._avg.rating ?? 0;
  const ratingCount = aggregate._count._all ?? 0;

  await tx.provider.update({
    where: { id: targetId },
    data: {
      ratingAvg,
      ratingCount,
      rating: ratingAvg,
      reviews: ratingCount,
    },
  });

  if (targetType === "studio") {
    const studio = await tx.studio.findUnique({
      where: { providerId: targetId },
      select: { id: true },
    });
    if (!studio) {
      throw new AppError("Review target not found", 404, "REVIEW_TARGET_NOT_FOUND");
    }
    await tx.studio.update({
      where: { id: studio.id },
      data: { ratingAvg, ratingCount },
    });
  }
}

export async function createReview(input: {
  currentUserId: string;
  bookingId: string;
  rating: number;
  text?: string;
  nowUtc?: Date;
}): Promise<ReviewDto> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      clientUserId: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      service: { select: { durationMin: true } },
      provider: { select: { id: true, type: true } },
    },
  });

  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }

  const isAllowed = canLeaveReview({
    booking,
    currentUserId: input.currentUserId,
    nowUtc: input.nowUtc ?? new Date(),
  });
  if (!isAllowed) {
    throw new AppError("Review not allowed", 403, "REVIEW_NOT_ALLOWED");
  }

  const target = requireReviewTarget(booking);
  const existing = await prisma.review.findUnique({
    where: { bookingId: input.bookingId },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("Review already exists", 409, "REVIEW_ALREADY_EXISTS");
  }

  let created: Prisma.ReviewGetPayload<{
    include: {
      author: { select: { displayName: true } };
      booking: { select: { clientName: true } };
    };
  }>;

  try {
    created = await prisma.$transaction(async (tx) => {
      if (target.targetType === "studio") {
        const studio = await tx.studio.findUnique({
          where: { providerId: target.targetId },
          select: { id: true },
        });
        if (!studio) {
          throw new AppError("Review target not found", 404, "REVIEW_TARGET_NOT_FOUND");
        }
      }

      const review = await tx.review.create({
        data: {
          bookingId: input.bookingId,
          authorId: input.currentUserId,
          targetType: target.targetType,
          targetId: target.targetId,
          rating: input.rating,
          text: input.text?.trim() || null,
        },
        include: {
          author: { select: { displayName: true } },
          booking: { select: { clientName: true } },
        },
      });

      await recalculateTargetRatings(tx, target.targetType, target.targetId);
      return review;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Review already exists", 409, "REVIEW_ALREADY_EXISTS");
    }
    throw error;
  }

  return toReviewDto(created);
}

export async function listReviews(input: {
  targetType: ReviewTargetType;
  targetId: string;
  limit: number;
  offset: number;
}): Promise<ReviewDto[]> {
  const reviews = await prisma.review.findMany({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
    },
    orderBy: { createdAt: "desc" },
    take: input.limit,
    skip: input.offset,
    include: {
      author: { select: { displayName: true } },
      booking: { select: { clientName: true } },
    },
  });
  return reviews.map(toReviewDto);
}

export async function canLeaveReviewForBooking(input: {
  currentUserId: string;
  bookingId: string;
  nowUtc?: Date;
}): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      clientUserId: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      service: { select: { durationMin: true } },
      review: { select: { id: true } },
    },
  });

  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }

  if (booking.review) {
    return false;
  }

  return canLeaveReview({
    booking,
    currentUserId: input.currentUserId,
    nowUtc: input.nowUtc ?? new Date(),
  });
}
