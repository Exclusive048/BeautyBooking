"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { StarsDisplay } from "@/features/master/components/reviews/stars-display";
import { fetchStudioProfile } from "@/features/booking/lib/studio-booking";
import {
  REVIEWS_PAGE_SIZE,
  reviewsProbeLimit,
} from "@/features/public-profile/master/reviews-constants";
import { fetchJson } from "@/lib/http/client";
import type { ReviewDto } from "@/lib/reviews/types";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
  initialRating: number;
  initialReviewsCount: number;
  initialReviews: ReviewDto[];
  initialHasMore: boolean;
  canReviewBookingId: string | null;
};

export function StudioReviewsSectionClient({
  studioId,
  initialRating,
  initialReviewsCount,
  initialReviews,
  initialHasMore,
  canReviewBookingId,
}: Props) {
  const [reviews, setReviews] = useState<ReviewDto[]>(initialReviews);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [rating, setRating] = useState(initialRating);
  const [reviewsCount, setReviewsCount] = useState(initialReviewsCount);
  const [showReviewForm, setShowReviewForm] = useState(false);

  // STUDIO-REVIEWS-NO-LOADMORE: тот же пейджер, что у мастера
  // (`public-profile/master/reviews-preview.tsx`). Раньше студия показывала
  // первые три отзыва, а остальные были недоступны вовсе. Смещение — сколько
  // уже показано; n+1-проба отвечает «есть ли ещё», дубли по id отсекаются
  // (новый отзыв между страницами сдвигает смещение). Отказ GET-листинга не
  // бывает действенным, поэтому строка — своя (FIX-C8).
  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const data = await fetchJson<{ reviews: ReviewDto[] }>(
        `/api/reviews?targetType=studio&targetId=${encodeURIComponent(studioId)}` +
          `&limit=${reviewsProbeLimit(REVIEWS_PAGE_SIZE)}&offset=${reviews.length}`,
        { cache: "no-store" },
      );
      const batch = data.reviews ?? [];
      const page = batch.slice(0, REVIEWS_PAGE_SIZE);
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.filter((r) => !seen.has(r.id))];
      });
      setHasMore(batch.length > REVIEWS_PAGE_SIZE);
    } catch {
      setLoadMoreError(UI_TEXT.publicStudio.reviewsLoadFailed);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <StarsDisplay rating={rating} size="sm" />
          <span>{reviewsCount} {UI_TEXT.publicStudio.reviewsCountLabel}</span>
        </div>
        {canReviewBookingId && !showReviewForm ? (
          <Button
            type="button"
            onClick={() => setShowReviewForm(true)}
            variant="secondary"
            size="sm"
          >
            {UI_TEXT.publicStudio.reviewLeave}
          </Button>
        ) : null}
      </div>

      {showReviewForm && canReviewBookingId ? (
        <div className="mt-4">
          <ReviewForm
            bookingId={canReviewBookingId}
            onCancel={() => setShowReviewForm(false)}
            onSubmitted={async (created) => {
              setShowReviewForm(false);
              // Новый отзыв встаёт сверху и не выталкивает уже показанные.
              setReviews((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
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
                <StarsDisplay rating={review.rating} size="sm" />
              </div>
              {review.text ? <div className="mt-2 text-sm text-text-muted">{review.text}</div> : null}
              {review.publicTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {review.publicTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border border-border-subtle bg-bg-input/80 px-2 py-1 text-[11px] text-text-sec"
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

      {hasMore && reviews.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            onClick={() => void loadMore()}
            variant="secondary"
            size="sm"
            className="rounded-lg"
            disabled={loadingMore}
          >
            {loadingMore ? UI_TEXT.publicStudio.reviewsLoadMoreLoading : UI_TEXT.publicStudio.reviewsLoadMore}
          </Button>
          {loadMoreError ? <div className="text-sm text-text-sec">{loadMoreError}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
