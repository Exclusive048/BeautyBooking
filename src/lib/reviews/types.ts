import type { Review, ReviewTagType, ReviewTargetType } from "@prisma/client";
import { encodePublicId } from "@/lib/public-id";

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

// Rule 12 (RULE-12-REVIEWS, FIX-18): the public reviews payload must carry
// NO internal CUID for the author or the review row, and no Booking CUID.
//  - `id` is an OPAQUE TOKEN (encodePublicId) — the report/reply/[id] routes
//    decode it server-side (decodePublicId is backward-compatible: raw cuids
//    from cabinet surfaces pass through unchanged).
//  - `authorId` is REPLACED by `isOwnReview` — a per-viewer boolean computed
//    server-side (the endpoint knows the session + the author); anon → false.
//    Never infer "is this mine" client-side from a leaked id.
//  - `bookingId` is gated on the same authorization as `privateTags`
//    (master owner / admin only); the public/anon payload omits it.
export type ReviewDto = {
  id: string;
  bookingId?: string | null;
  isOwnReview: boolean;
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
  options?: { includePrivateTags?: boolean; currentUserId?: string | null }
): ReviewDto {
  const fallbackName = review.booking?.clientName?.trim() || "Client";
  const includePrivateTags = options?.includePrivateTags ?? false;
  const currentUserId = options?.currentUserId ?? null;
  const tags = (review.tags ?? []).map(toReviewTagDto);
  const publicTags = tags.filter((tag) => tag.type === "PUBLIC");
  const privateTags = tags.filter((tag) => tag.type === "PRIVATE");
  // RULE-12-REVIEWS: per-viewer own-review flag (server-side); never expose authorId.
  const isOwnReview = currentUserId != null && review.authorId === currentUserId;

  return {
    // RULE-12-REVIEWS: opaque token; report/reply/[id] routes decode it.
    id: encodePublicId(review.id),
    // RULE-12-REVIEWS: Booking CUID only for authorized master/admin viewers.
    ...(includePrivateTags ? { bookingId: review.bookingId } : {}),
    isOwnReview,
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
