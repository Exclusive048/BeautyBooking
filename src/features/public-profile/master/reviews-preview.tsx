"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewForm } from "@/features/reviews/components/review-form";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
  rating: number;
  reviewsCount: number;
  initialReviews: ReviewDto[];
  canReviewBookingId: string | null;
  onRatingRefresh?: () => Promise<void>;
};

function reviewStars(value: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

export function ReviewsPreview({
  providerId,
  rating,
  reviewsCount,
  initialReviews,
  canReviewBookingId,
  onRatingRefresh,
}: Props) {
  const [reviews, setReviews] = useState<ReviewDto[]>(initialReviews);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [allReviews, setAllReviews] = useState<ReviewDto[] | null>(null);
  const [allReviewsLoading, setAllReviewsLoading] = useState(false);
  const [allReviewsError, setAllReviewsError] = useState<string | null>(null);

  const hasMoreThanPreview = reviewsCount > reviews.length;
  const ratingLabel = useMemo(() => UI_FMT.ratingLabel(rating, reviewsCount), [rating, reviewsCount]);

  async function openAllReviews() {
    setShowAllModal(true);
    if (allReviews || allReviewsLoading) return;
    setAllReviewsLoading(true);
    setAllReviewsError(null);
    try {
      const res = await fetch(
        `/api/reviews?targetType=provider&targetId=${encodeURIComponent(providerId)}&limit=50&offset=0`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => null)) as ApiResponse<{ reviews: ReviewDto[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(UI_TEXT.publicProfile.reviews.loadFailed);
      }
      setAllReviews(json.data.reviews);
    } catch {
      setAllReviewsError(UI_TEXT.publicProfile.reviews.loadFailed);
    } finally {
      setAllReviewsLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-text-main">{UI_TEXT.publicProfile.reviews.title}</div>
            <div className="mt-1 text-xs text-text-sec">{ratingLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            {hasMoreThanPreview ? (
              <button
                type="button"
                onClick={() => void openAllReviews()}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1.5 text-sm transition hover:bg-bg-card"
              >
                {UI_TEXT.publicProfile.reviews.all}
              </button>
            ) : null}
            {canReviewBookingId && !showReviewForm ? (
              <button
                type="button"
                onClick={() => setShowReviewForm(true)}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1.5 text-sm transition hover:bg-bg-card"
              >
                {UI_TEXT.publicProfile.reviews.leaveReview}
              </button>
            ) : null}
          </div>
        </div>

        {showReviewForm && canReviewBookingId ? (
          <div className="mt-4">
            <ReviewForm
              bookingId={canReviewBookingId}
              onCancel={() => setShowReviewForm(false)}
              onSubmitted={async (created) => {
                setShowReviewForm(false);
                setReviews((prev) => [created, ...prev].slice(0, 3));
                await onRatingRefresh?.();
              }}
            />
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {reviews.length === 0 ? (
            <div className="text-sm text-text-sec">{UI_TEXT.publicProfile.reviews.noReviews}</div>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{review.authorName}</div>
                  <div className="text-xs text-text-sec">{reviewStars(review.rating)}</div>
                </div>
                {review.text ? <div className="mt-2 text-sm text-text-sec">{review.text}</div> : null}
              </div>
            ))
          )}
        </div>
      </CardContent>

      {showAllModal ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowAllModal(false)}
            aria-label={UI_TEXT.common.cancel}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-[26px] border border-border-subtle bg-bg-card p-5 shadow-hover">
              <div className="mb-3 text-lg font-semibold">{UI_TEXT.publicProfile.reviews.all}</div>
              {allReviewsLoading ? <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div> : null}
              {allReviewsError ? <div className="text-sm text-red-600">{allReviewsError}</div> : null}
              {!allReviewsLoading && !allReviewsError ? (
                <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
                  {(allReviews ?? []).map((review) => (
                    <div key={review.id} className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{review.authorName}</div>
                        <div className="text-xs text-text-sec">{reviewStars(review.rating)}</div>
                      </div>
                      {review.text ? <div className="mt-2 text-sm text-text-sec">{review.text}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

