"use client";

import { useState } from "react";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";
import { ReviewsPreview } from "@/features/public-profile/master/reviews-preview";

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
    const res = await fetch(`/api/providers/${providerId}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ApiResponse<{ provider: ProviderProfileDto | null }> | null;
    if (!res.ok || !json || !json.ok || !json.data.provider) return;
    setRating(json.data.provider.rating);
    setReviewsCount(json.data.provider.reviews);
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
