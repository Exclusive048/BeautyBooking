"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import type { ReviewDto } from "@/lib/reviews/types";
import { REVIEW_WINDOW_DAYS } from "@/lib/reviews/constants";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

// AUDIT (sections 4,7):
// - Master cabinet renders both public tags and private "improve" tags.
// - Top private-tag summary is shown in the stats area.
type SortMode = "DATE_ASC" | "DATE_DESC" | "RATING_ASC" | "RATING_DESC";

type Props = {
  masterId: string;
};

function formatReviewDate(value: string, timeZone: string): string {
  return UI_FMT.dateTimeLong(value, { timeZone });
}

function canReportReview(review: ReviewDto): boolean {
  if (review.reportedAt) return false;
  const createdAtMs = new Date(review.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  const deadlineMs = createdAtMs + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() <= deadlineMs;
}

function updateReview(items: ReviewDto[], nextReview: ReviewDto): ReviewDto[] {
  return items.map((item) => (item.id === nextReview.id ? nextReview : item));
}

function collectTopPrivateTags(reviews: ReviewDto[]): Array<{ code: string; label: string; count: number }> {
  const byCode = new Map<string, { code: string; label: string; count: number }>();
  for (const review of reviews) {
    const privateTags = review.privateTags ?? [];
    for (const tag of privateTags) {
      const current = byCode.get(tag.code);
      if (current) {
        current.count += 1;
      } else {
        byCode.set(tag.code, { code: tag.code, label: tag.label, count: 1 });
      }
    }
  }
  return Array.from(byCode.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3);
}

export function MasterReviewsPage({ masterId }: Props) {
  const t = UI_TEXT.master.reviews;
  const viewerTimeZone = useViewerTimeZoneContext();
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("DATE_DESC");
  const [actionId, setActionId] = useState<string | null>(null);

  const loadReviews = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        targetType: "provider",
        targetId: masterId,
        limit: "100",
        offset: "0",
      });
      const res = await fetch(`/api/reviews?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ reviews: ReviewDto[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `Ошибка API: ${res.status}`);
      }
      setReviews(json.data.reviews);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : t.loadFailed);
    } finally {
      if (!signal || !signal.aborted) {
        setLoading(false);
      }
    }
  }, [masterId, t.loadFailed]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReviews(controller.signal);
    return () => controller.abort();
  }, [loadReviews]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return total / reviews.length;
  }, [reviews]);

  const sortedReviews = useMemo(() => {
    const items = [...reviews];

    items.sort((a, b) => {
      if (sortMode === "DATE_ASC") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortMode === "DATE_DESC") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortMode === "RATING_ASC") {
        if (a.rating === b.rating) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.rating - b.rating;
      }
      if (a.rating === b.rating) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return b.rating - a.rating;
    });

    return items;
  }, [reviews, sortMode]);

  const topPrivateTags = useMemo(() => collectTopPrivateTags(reviews), [reviews]);

  const replyToReview = async (review: ReviewDto): Promise<void> => {
    if (review.replyText) return;

    const text = window.prompt(t.replyPlaceholder);
    const normalized = text?.trim() ?? "";
    if (!normalized) return;

    setActionError(null);
    setActionId(review.id);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(review.id)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ review: ReviewDto }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `Ошибка API: ${res.status}`);
      }
      setReviews((prev) => updateReview(prev, json.data.review));
    } catch (actionErrorValue) {
      setActionError(actionErrorValue instanceof Error ? actionErrorValue.message : t.replyFailed);
    } finally {
      setActionId(null);
    }
  };

  const reportReview = async (review: ReviewDto): Promise<void> => {
    if (!canReportReview(review)) return;

    const comment = window.prompt(t.reportPrompt);
    const normalized = comment?.trim() ?? "";
    if (!normalized) return;

    setActionError(null);
    setActionId(review.id);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(review.id)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ review: ReviewDto }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `Ошибка API: ${res.status}`);
      }
      setReviews((prev) => updateReview(prev, json.data.review));
    } catch (actionErrorValue) {
      setActionError(actionErrorValue instanceof Error ? actionErrorValue.message : t.reportFailed);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="lux-card rounded-[24px] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t.rating}</h3>
            <p className="mt-1 text-sm text-text-sec">
              {t.totalReviews(reviews.length)} - {averageRating.toFixed(1)}
            </p>
            <div className="mt-2">
              <div className="text-xs font-medium text-text-main">{t.canImprove}</div>
              {topPrivateTags.length === 0 ? (
                <div className="mt-1 text-xs text-text-sec">{t.noPrivateTags}</div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {topPrivateTags.map((tag) => (
                    <span
                      key={tag.code}
                      className="rounded-full border border-border-subtle bg-white/70 px-2 py-1 text-[11px] text-text-sec"
                    >
                      {tag.label}: {tag.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <label className="text-sm text-text-sec">
            {t.sortBy.label}
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="DATE_ASC">{t.sortBy.oldest}</option>
              <option value="DATE_DESC">{t.sortBy.newest}</option>
              <option value="RATING_ASC">{t.sortBy.lowest}</option>
              <option value="RATING_DESC">{t.sortBy.highest}</option>
            </select>
          </label>
        </div>
      </section>

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div>
      ) : null}
      {actionError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{actionError}</div>
      ) : null}

      {!loading && !error ? (
        <section className="lux-card rounded-[24px] p-4">
          <h3 className="mb-3 text-sm font-semibold">{t.title}</h3>
          {sortedReviews.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-sec">
              {t.empty}
              <div className="mt-1 text-xs">{t.emptyHint}</div>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedReviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-border-subtle bg-bg-input/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{review.authorName}</div>
                    <div className="text-xs text-text-sec">
                      {"*".repeat(review.rating)}
                      {" "}
                      {formatReviewDate(review.createdAt, viewerTimeZone)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-text-sec">
                    {review.text?.trim() ? review.text : t.noText}
                  </div>
                  {review.publicTags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {review.publicTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full border border-border-subtle bg-white/70 px-2 py-1 text-[11px] text-text-sec"
                        >
                          {tag.icon ? `${tag.icon} ` : ""}
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {(review.privateTags?.length ?? 0) > 0 ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2 dark:border-amber-400/40 dark:bg-amber-950/40">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        {t.privateTagsTitle}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(review.privateTags ?? []).map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded-full border border-amber-300 bg-white/80 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-400/40 dark:bg-amber-900/30 dark:text-amber-200"
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {review.replyText ? (
                    <div className="mt-3 rounded-lg border border-border-subtle bg-white/70 p-2 text-sm text-text-main">
                      <div className="text-xs uppercase tracking-wide text-text-sec">{t.masterReply}</div>
                      <div className="mt-1">{review.replyText}</div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!review.replyText ? (
                      <Button
                        onClick={() => void replyToReview(review)}
                        disabled={actionId === review.id}
                        variant="secondary"
                        size="sm"
                      >
                        {t.reply}
                      </Button>
                    ) : null}
                    {canReportReview(review) ? (
                      <Button
                        onClick={() => void reportReview(review)}
                        disabled={actionId === review.id}
                        variant="danger"
                        size="sm"
                      >
                        {t.report}
                      </Button>
                    ) : null}
                    {review.reportedAt ? (
                      <div className="text-xs text-text-sec">
                        {t.reportedAt} {formatReviewDate(review.reportedAt, viewerTimeZone)}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
