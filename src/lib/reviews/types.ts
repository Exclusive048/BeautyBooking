import type { Review, ReviewTagType, ReviewTargetType } from "@prisma/client";

// AUDIT (sections 2,4):
// - ReviewDto includes publicTags and optional privateTags.
// - privateTags are emitted only for authorized master/admin contexts.
export type ReviewTagDto = {
  id: string;
  code: string;
  label: string;
  icon: string | null;
  type: ReviewTagType;
};

export type ReviewDto = {
  id: string;
  bookingId: string | null;
  authorId: string;
  authorName: string;
  targetType: ReviewTargetType;
  targetId: string;
  rating: number;
  text: string | null;
  publicTags: ReviewTagDto[];
  privateTags?: ReviewTagDto[];
  replyText: string | null;
  repliedAt: string | null;
  reportedAt: string | null;
  createdAt: string;
};

type ReviewTagLink = {
  tag: {
    id: string;
    code: string;
    label: string;
    icon: string | null;
    type: ReviewTagType;
  };
};

type ReviewDtoSource = Review & {
  author: { displayName: string | null };
  booking: { clientName: string } | null;
  tags?: ReviewTagLink[];
};

function toReviewTagDto(input: ReviewTagLink): ReviewTagDto {
  return {
    id: input.tag.id,
    code: input.tag.code,
    label: input.tag.label,
    icon: input.tag.icon ?? null,
    type: input.tag.type,
  };
}

export function toReviewDto(
  review: ReviewDtoSource,
  options?: { includePrivateTags?: boolean }
): ReviewDto {
  const fallbackName = review.booking?.clientName?.trim() || "Client";
  const includePrivateTags = options?.includePrivateTags ?? false;
  const tags = (review.tags ?? []).map(toReviewTagDto);
  const publicTags = tags.filter((tag) => tag.type === "PUBLIC");
  const privateTags = tags.filter((tag) => tag.type === "PRIVATE");

  return {
    id: review.id,
    bookingId: review.bookingId,
    authorId: review.authorId,
    authorName: review.author.displayName?.trim() || fallbackName,
    targetType: review.targetType,
    targetId: review.targetId,
    rating: review.rating,
    text: review.text ?? null,
    publicTags,
    ...(includePrivateTags ? { privateTags } : {}),
    replyText: review.replyText ?? null,
    repliedAt: review.repliedAt ? review.repliedAt.toISOString() : null,
    reportedAt: review.reportedAt ? review.reportedAt.toISOString() : null,
    createdAt: review.createdAt.toISOString(),
  };
}
