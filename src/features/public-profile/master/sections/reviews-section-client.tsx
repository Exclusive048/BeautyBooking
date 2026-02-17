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
  canReviewBookingId: string | null;
};

export function ReviewsSectionClient({
  providerId,
  initialRating,
  initialReviewsCount,
  initialReviews,
  canReviewBookingId,
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
      canReviewBookingId={canReviewBookingId}
      onRatingRefresh={handleRatingRefresh}
    />
  );
}
