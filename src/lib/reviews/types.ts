import type { Review, ReviewTargetType } from "@prisma/client";

export type ReviewDto = {
  id: string;
  bookingId: string | null;
  authorId: string;
  authorName: string;
  targetType: ReviewTargetType;
  targetId: string;
  rating: number;
  text: string | null;
  replyText: string | null;
  repliedAt: string | null;
  reportedAt: string | null;
  createdAt: string;
};

export function toReviewDto(
  review: Review & { author: { displayName: string | null }; booking: { clientName: string } | null }
): ReviewDto {
  const fallbackName = review.booking?.clientName?.trim() || "Client";
  return {
    id: review.id,
    bookingId: review.bookingId,
    authorId: review.authorId,
    authorName: review.author.displayName?.trim() || fallbackName,
    targetType: review.targetType,
    targetId: review.targetId,
    rating: review.rating,
    text: review.text ?? null,
    replyText: review.replyText ?? null,
    repliedAt: review.repliedAt ? review.repliedAt.toISOString() : null,
    reportedAt: review.reportedAt ? review.reportedAt.toISOString() : null,
    createdAt: review.createdAt.toISOString(),
  };
}
