"use client";

import { useState } from "react";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import { ReviewsPreview } from "@/features/public-profile/master/reviews-preview";
import { fetchJson } from "@/lib/http/client";

type Props = {
  providerId: string;
  initialRating: number;
  initialReviewsCount: number;
  initialReviews: ReviewDto[];
  /** REVIEWS-LOADMORE-01: server-side n+1 probe result — whether a page beyond
   *  the SSR preview exists. Not derivable from `initialReviewsCount` (that
   *  aggregate drifts from the real count). */
  initialHasMore: boolean;
  canReviewBookingId: string | null;
  currentUserId?: string | null;
  /** Whether the AI «Резюме» button should render at all. False ↔
   * feature flag off / OpenAI key missing in env. */
  aiSummaryEnabled: boolean;
};

export function ReviewsSectionClient({
  providerId,
  initialRating,
  initialReviewsCount,
  initialReviews,
  initialHasMore,
  canReviewBookingId,
  currentUserId = null,
  aiSummaryEnabled,
}: Props) {
  const [rating, setRating] = useState(initialRating);
  const [reviewsCount, setReviewsCount] = useState(initialReviewsCount);

  async function handleRatingRefresh() {
    // Фон: обновить рейтинг после отзыва; не прочитали — остаётся прежний.
    const data = await fetchJson<{ provider: ProviderProfileDto | null }>(`/api/providers/${providerId}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!data?.provider) return;
    setRating(data.provider.rating);
    setReviewsCount(data.provider.reviews);
  }

  return (
    <ReviewsPreview
      providerId={providerId}
      rating={rating}
      reviewsCount={reviewsCount}
      initialReviews={initialReviews}
      initialHasMore={initialHasMore}
      canReviewBookingId={canReviewBookingId}
      onRatingRefresh={handleRatingRefresh}
      currentUserId={currentUserId}
      aiSummaryEnabled={aiSummaryEnabled}
    />
  );
}
