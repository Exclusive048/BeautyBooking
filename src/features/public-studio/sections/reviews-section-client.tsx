"use client";

import { useState } from "react";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { fetchStudioProfile } from "@/features/booking/lib/studio-booking";
import type { ReviewDto } from "@/lib/reviews/types";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
  initialRating: number;
  initialReviewsCount: number;
  initialReviews: ReviewDto[];
  canReviewBookingId: string | null;
};

function stars(value: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return "*".repeat(rounded) + "-".repeat(5 - rounded);
}

export function StudioReviewsSectionClient({
  studioId,
  initialRating,
  initialReviewsCount,
  initialReviews,
  canReviewBookingId,
}: Props) {
  const [reviews, setReviews] = useState<ReviewDto[]>(initialReviews);
  const [rating, setRating] = useState(initialRating);
  const [reviewsCount, setReviewsCount] = useState(initialReviewsCount);
  const [showReviewForm, setShowReviewForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-text-muted">
          {stars(rating)} / {reviewsCount} {UI_TEXT.publicStudio.reviewsCountLabel}
        </div>
        {canReviewBookingId && !showReviewForm ? (
          <button
            type="button"
            onClick={() => setShowReviewForm(true)}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            {UI_TEXT.publicStudio.reviewLeave}
          </button>
        ) : null}
      </div>

      {showReviewForm && canReviewBookingId ? (
        <div className="mt-4">
          <ReviewForm
            bookingId={canReviewBookingId}
            onCancel={() => setShowReviewForm(false)}
            onSubmitted={async (created) => {
              setShowReviewForm(false);
              setReviews((prev) => [created, ...prev].slice(0, 3));
              const refreshed = await fetchStudioProfile(studioId);
              if (refreshed.ok) {
                setRating(refreshed.provider.rating);
                setReviewsCount(refreshed.provider.reviews);
              }
            }}
          />
        </div>
      ) : null}

      <div className="space-y-3">
        {reviews.length === 0 ? (
          <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.reviewEmpty}</div>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-text">{review.authorName}</div>
                <div className="text-xs text-text-muted">{stars(review.rating)}</div>
              </div>
              {review.text ? <div className="mt-2 text-sm text-text-muted">{review.text}</div> : null}
              {review.publicTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {review.publicTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border border-border bg-white/70 px-2 py-1 text-[11px] text-text-muted"
                    >
                      {tag.icon ? `${tag.icon} ` : ""}
                      {tag.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
