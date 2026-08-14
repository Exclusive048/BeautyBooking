"use client";

import { Flag, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  REVIEWS_PAGE_SIZE,
  reviewsProbeLimit,
} from "@/features/public-profile/master/reviews-constants";
import { StarsDisplay } from "@/features/master/components/reviews/stars-display";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { ReportReviewModal } from "@/features/reviews/components/report-review-modal";
import type { ReviewDto } from "@/lib/reviews/types";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
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
  /** REVIEWS-LOADMORE-01: whether a page exists beyond `initialReviews`, from
   *  the server's n+1 probe. */
  initialHasMore: boolean;
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
  // RULE-12-REVIEWS (FIX-18): own-review check via server-computed flag (no authorId leak).
  const canReport = currentUserId && !review.isOwnReview && !review.reportedAt;
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{review.authorName}</div>
        <div className="flex items-center gap-2">
          <StarsDisplay rating={review.rating} size="sm" />
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
          ) : review.reportedAt && currentUserId && !review.isOwnReview ? (
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
  initialHasMore,
  canReviewBookingId,
  onRatingRefresh,
  currentUserId = null,
  aiSummaryEnabled = false,
}: Props) {
  const t = UI_TEXT.publicProfile.reviews;
  const reduce = useReducedMotion();

  const [reviews, setReviews] = useState<ReviewDto[]>(initialReviews);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // «Is there more?» comes from the API's n+1 probe — never from the
  // `reviewsCount` aggregate, which drifts from the real active-review count in
  // both directions (seed: Анна 47 stored / 54 real; Марина 0 stored / 3 real).
  // Gating on that aggregate would strand reviews behind a hidden button or
  // spin on an empty one. Seeded from the server's probe on first paint.
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);

  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);

  const ratingLabel = useMemo(() => UI_FMT.ratingLabel(rating, reviewsCount), [rating, reviewsCount]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      // Offset = what we already render. `listReviews` applies
      // ACTIVE_REVIEW_FILTER (invariant #17) server-side, so soft-deleted
      // reviews stay out of both the page and the offset arithmetic.
      // Ask for one row beyond the page: its presence means another page exists.
      // FIX-C8: тот же чокпоинт, что и у резюме, — но решение ДРУГОЕ. Отказ
      // подгрузки страницы отзывов не бывает действенным (это GET-листинг;
      // всё, что он может сказать, — «не получилось»), поэтому здесь
      // сознательно остаётся строка поверхности. Общий разбор нужен не ради
      // passthrough, а чтобы в файле не жила вторая, ручная форма чтения
      // конверта: именно из неё вырастает следующий F3.
      const data = await fetchJson<{ reviews: ReviewDto[] }>(
        `/api/reviews?targetType=provider&targetId=${encodeURIComponent(providerId)}` +
          `&limit=${reviewsProbeLimit(REVIEWS_PAGE_SIZE)}&offset=${reviews.length}`,
        { cache: "no-store" },
      );
      const batch = data.reviews ?? [];
      // The probe row is a signal only — drop it, so it isn't rendered twice
      // (it returns as the first row of the next page).
      const page = batch.slice(0, REVIEWS_PAGE_SIZE);
      // Append, never replace. Dedupe by id because offset paging can repeat a
      // row when a review is added/removed between pages (audit 4b flagged the
      // boundary); duplicate ids would also collide as React keys.
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.filter((r) => !seen.has(r.id))];
      });
      setHasMore(batch.length > REVIEWS_PAGE_SIZE);
    } catch {
      setLoadMoreError(t.loadFailed);
    } finally {
      setLoadingMore(false);
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
      // FIX-C3 · SMOKE-01 · F3 — ответ разбирается общим `fetchJson`, а не
      // руками. Прежний код тело ЧИТАЛ, но `json.error.message` не смотрел ни в
      // одной ветке: и `!res.ok`, и `catch` печатали одну строку «Попробуйте
      // через минуту». Для суточного потолка ИИ (FIX-B16 отдаёт 429
      // `AI_DAILY_LIMIT_REACHED` с курируемой строкой «…дневной лимит исчерпан.
      // Попробуйте завтра.») это врало о МАСШТАБЕ ВРЕМЕНИ: пользователь ждал
      // минуту и жал снова, пока не решал, что продукт сломан.
      const data = await fetchJson<{ summary: string | null; reviewsCount: number }>(
        `/api/public/providers/${encodeURIComponent(providerId)}/review-summary`,
        { cache: "no-store" },
      );
      if (!data.summary) {
        setSummaryError(t.summaryFewReviews);
      } else {
        setSummaryText(data.summary);
      }
    } catch (error) {
      // Своя строка остаётся дефолтом: она конкретнее generic-ответа и уместна,
      // когда сервер СВОЕЙ не прислал (сеть, 500 без тела). Показывается ровно
      // то, что сервер сказал, — и только когда он это сказал.
      //
      // FIX-C8: то же решение, но общим помощником. Инлайновое
      // `error instanceof ApiClientError && error.fromServer ? … : …` было
      // ПЕРВЫМ экземпляром паттерна, и три неподключённые ИИ-поверхности
      // (`suggest-reply`, `suggest-description`, `advisor`) при подключении
      // скопировали бы именно его — вместе с шансом переписать условие
      // немного иначе на каждой.
      setSummaryError(serverMessageOr(error, t.summaryFailed));
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
              <Sparkles className="h-4 w-4 text-accent-text" />
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
                // No `.slice(0, 3)` here any more: the list is now progressive,
                // so trimming to the preview size would throw away every page
                // the visitor had already loaded.
                setReviews((prev) => [created, ...prev]);
                await onRatingRefresh?.();
              }}
            />
          </div>
        ) : null}

        <motion.div
          className="mt-4 space-y-3"
          initial="hidden"
          animate="visible"
          variants={reduce ? undefined : { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
        >
          {reviews.length === 0 ? (
            <div className="text-sm text-text-sec">{t.noReviews}</div>
          ) : (
            reviews.map((review) => (
              <motion.div
                key={review.id}
                variants={reduce ? undefined : {
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
                }}
              >
                <ReviewCard review={review} currentUserId={currentUserId} onReport={setReportingReviewId} />
              </motion.div>
            ))
          )}
        </motion.div>

        {/* REVIEWS-LOADMORE-01: replaces the «Все отзывы» dialog, which fetched
            a single limit=50 page and silently dropped the tail. Reviews now
            append in place until the API returns a short batch. */}
        {hasMore && reviews.length > 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2">
            <Button
              type="button"
              onClick={() => void loadMore()}
              variant="secondary"
              size="sm"
              className="rounded-lg"
              disabled={loadingMore}
            >
              {loadingMore ? t.loadMoreLoading : t.loadMore}
            </Button>
            {loadMoreError ? (
              <div className="text-sm text-text-sec">{loadMoreError}</div>
            ) : null}
          </div>
        ) : null}
      </CardContent>

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
