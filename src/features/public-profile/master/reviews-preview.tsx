"use client";

import { Flag, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { ReportReviewModal } from "@/features/reviews/components/report-review-modal";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

// AUDIT (section 4):
// - Public review cards render only public tags.
// - Private tags are never shown in the public profile UI.
type Props = {
  providerId: string;
  rating: number;
  reviewsCount: number;
  initialReviews: ReviewDto[];
  canReviewBookingId: string | null;
  onRatingRefresh?: () => Promise<void>;
  currentUserId?: string | null;
  /** fix-03: when false, the «Резюме» button hides entirely instead
   * of showing a confusing 503 error to the visitor. */
  aiSummaryEnabled?: boolean;
};

const reviewCardText = UI_TEXT.publicProfile.reviews;
const masterReviewText = UI_TEXT.master.reviews;

function ReviewCard({
  review,
  currentUserId,
  onReport,
}: {
  review: ReviewDto;
  currentUserId?: string | null;
  onReport?: (id: string) => void;
}) {
  const canReport = currentUserId && currentUserId !== review.authorId && !review.reportedAt;
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{review.authorName}</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-text-sec">{UI_FMT.starsLabel(review.rating)}</div>
          {canReport ? (
            <button
              type="button"
              onClick={() => onReport?.(review.id)}
              aria-label={masterReviewText.report}
              title={masterReviewText.report}
              className="rounded-lg p-1 text-text-sec/50 transition hover:text-text-sec focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : review.reportedAt && currentUserId && currentUserId !== review.authorId ? (
            <span className="text-[10px] text-text-sec/50">{masterReviewText.reportedAt}</span>
          ) : null}
        </div>
      </div>
      {review.text ? <div className="mt-2 text-sm text-text-sec">{review.text}</div> : null}
      {review.publicTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {review.publicTags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full border border-border-subtle bg-bg-card px-2 py-1 text-[11px] text-text-sec"
            >
              {tag.icon ? `${tag.icon} ` : ""}
              {tag.label}
            </span>
          ))}
        </div>
      ) : null}
      {review.replyText ? (
        <div className="mt-2 rounded-xl border border-border-subtle bg-bg-card p-2 text-sm text-text-main">
          <div className="text-xs uppercase text-text-sec">{reviewCardText.masterReply}</div>
          <div className="mt-1">{review.replyText}</div>
        </div>
      ) : null}
    </div>
  );
}

export function ReviewsPreview({
  providerId,
  rating,
  reviewsCount,
  initialReviews,
  canReviewBookingId,
  onRatingRefresh,
  currentUserId = null,
  aiSummaryEnabled = false,
}: Props) {
  const t = UI_TEXT.publicProfile.reviews;

  const [reviews, setReviews] = useState<ReviewDto[]>(initialReviews);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [allReviews, setAllReviews] = useState<ReviewDto[] | null>(null);
  const [allReviewsLoading, setAllReviewsLoading] = useState(false);
  const [allReviewsError, setAllReviewsError] = useState<string | null>(null);
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);

  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);

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
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as ApiResponse<{ reviews: ReviewDto[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(t.loadFailed);
      }
      setAllReviews(json.data.reviews);
    } catch {
      setAllReviewsError(t.loadFailed);
    } finally {
      setAllReviewsLoading(false);
    }
  }

  async function toggleSummary() {
    if (summaryVisible) {
      setSummaryVisible(false);
      return;
    }
    setSummaryVisible(true);
    if (summaryText || summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(
        `/api/public/providers/${encodeURIComponent(providerId)}/review-summary`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        summary: string | null;
        reviewsCount: number;
      }> | null;
      if (!res.ok || !json || !json.ok) throw new Error(t.summaryFailed);
      if (!json.data.summary) {
        setSummaryError(t.summaryFewReviews);
      } else {
        setSummaryText(json.data.summary);
      }
    } catch {
      setSummaryError(t.summaryFailed);
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-text-main">{t.title}</div>
            <div className="mt-1 text-xs text-text-sec">{ratingLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            {/* fix-03: AI summary button hidden when feature flag is
                off — previously clicking it returned 503 and showed
                a generic «Не удалось сформировать резюме» which
                looked broken. The flag is server-resolved upstream. */}
            {aiSummaryEnabled && reviewsCount >= 3 ? (
              <Button
                type="button"
                onClick={() => void toggleSummary()}
                variant="secondary"
                size="sm"
                className="rounded-lg"
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                {t.summaryButton}
              </Button>
            ) : null}
            {hasMoreThanPreview ? (
              <Button
                type="button"
                onClick={() => void openAllReviews()}
                variant="secondary"
                size="sm"
                className="rounded-lg"
              >
                {t.all}
              </Button>
            ) : null}
            {canReviewBookingId && !showReviewForm ? (
              <Button
                type="button"
                onClick={() => setShowReviewForm(true)}
                variant="secondary"
                size="sm"
                className="rounded-lg"
              >
                {t.leaveReview}
              </Button>
            ) : null}
          </div>
        </div>

        {summaryVisible ? (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 dark:border-primary/30 dark:bg-primary/10">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-main">
              <Sparkles className="h-4 w-4 text-primary" />
              {t.summaryTitle}
            </div>
            {summaryLoading ? (
              <div className="text-sm text-text-sec">{t.summaryLoading}</div>
            ) : null}
            {summaryError ? (
              <div className="text-sm text-text-sec">{summaryError}</div>
            ) : null}
            {summaryText ? (
              <div className="text-sm leading-relaxed text-text-main">{summaryText}</div>
            ) : null}
          </div>
        ) : null}

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

        <motion.div
          className="mt-4 space-y-3"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
        >
          {reviews.length === 0 ? (
            <div className="text-sm text-text-sec">{t.noReviews}</div>
          ) : (
            reviews.map((review) => (
              <motion.div
                key={review.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
                }}
              >
                <ReviewCard review={review} currentUserId={currentUserId} onReport={setReportingReviewId} />
              </motion.div>
            ))
          )}
        </motion.div>
      </CardContent>

      {showAllModal ? (
        <div className="fixed inset-0 z-50">
          <Button
            variant="wrapper"
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowAllModal(false)}
            aria-label={UI_TEXT.common.cancel}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-[26px] border border-border-subtle bg-bg-card p-5 shadow-hover">
              <div className="mb-3 text-lg font-semibold">{t.all}</div>
              {allReviewsLoading ? <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div> : null}
              {allReviewsError ? <div className="text-sm text-red-600">{allReviewsError}</div> : null}
              {!allReviewsLoading && !allReviewsError ? (
                <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
                  {(allReviews ?? []).map((review) => (
                    <ReviewCard key={review.id} review={review} currentUserId={currentUserId} onReport={setReportingReviewId} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {reportingReviewId ? (
        <ReportReviewModal
          reviewId={reportingReviewId}
          open={true}
          onClose={() => setReportingReviewId(null)}
          onSuccess={() => {
            setReviews((prev) =>
              prev.map((r) =>
                r.id === reportingReviewId ? { ...r, reportedAt: new Date().toISOString() } : r
              )
            );
            setReportingReviewId(null);
          }}
        />
      ) : null}
    </Card>
  );
}
