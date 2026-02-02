import type { Review, ReviewTargetType } from "@prisma/client";

export type ReviewDto = {
  id: string;
  bookingId: string;
  authorId: string;
  authorName: string;
  targetType: ReviewTargetType;
  targetId: string;
  rating: number;
  text: string | null;
  createdAt: string;
};

export function toReviewDto(
  review: Review & { author: { displayName: string | null }; booking: { clientName: string } }
): ReviewDto {
  return {
    id: review.id,
    bookingId: review.bookingId,
    authorId: review.authorId,
    authorName: review.author.displayName?.trim() || review.booking.clientName,
    targetType: review.targetType,
    targetId: review.targetId,
    rating: review.rating,
    text: review.text ?? null,
    createdAt: review.createdAt.toISOString(),
  };
}

