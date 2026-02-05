"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import type { ReviewDto } from "@/lib/reviews/types";
import { REVIEW_WINDOW_DAYS } from "@/lib/reviews/constants";

// AUDIT (sections 4,7):
// - Master cabinet renders both public tags and private "improve" tags.
// - Top private-tag summary is shown in the stats area.
type SortMode = "DATE_ASC" | "DATE_DESC" | "RATING_ASC" | "RATING_DESC";

type Props = {
  masterId: string;
};

function formatReviewDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setReviews(json.data.reviews);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load reviews");
    } finally {
      if (!signal || !signal.aborted) {
        setLoading(false);
      }
    }
  }, [masterId]);

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

    const text = window.prompt("Reply to review");
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
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setReviews((prev) => updateReview(prev, json.data.review));
    } catch (actionErrorValue) {
      setActionError(actionErrorValue instanceof Error ? actionErrorValue.message : "Failed to reply");
    } finally {
      setActionId(null);
    }
  };

  const reportReview = async (review: ReviewDto): Promise<void> => {
    if (!canReportReview(review)) return;

    const comment = window.prompt("Report reason");
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
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setReviews((prev) => updateReview(prev, json.data.review));
    } catch (actionErrorValue) {
      setActionError(actionErrorValue instanceof Error ? actionErrorValue.message : "Failed to report review");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="lux-card rounded-[24px] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Review stats</h3>
            <p className="mt-1 text-sm text-text-sec">
              Total: {reviews.length} - Avg: {averageRating.toFixed(1)}
            </p>
            <div className="mt-2">
              <div className="text-xs font-medium text-text-main">What can be improved</div>
              {topPrivateTags.length === 0 ? (
                <div className="mt-1 text-xs text-text-sec">No private tags yet</div>
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
            Sort
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="DATE_ASC">Date: old to new</option>
              <option value="DATE_DESC">Date: new to old</option>
              <option value="RATING_ASC">Rating: 1 to 5</option>
              <option value="RATING_DESC">Rating: 5 to 1</option>
            </select>
          </label>
        </div>
      </section>

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Loading reviews...</div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {actionError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</div>
      ) : null}

      {!loading && !error ? (
        <section className="lux-card rounded-[24px] p-4">
          <h3 className="mb-3 text-sm font-semibold">Reviews</h3>
          {sortedReviews.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-sec">
              No reviews yet.
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
                      {formatReviewDate(review.createdAt)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-text-sec">
                    {review.text?.trim() ? review.text : "No comment"}
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
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-amber-800">
                        Can improve
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(review.privateTags ?? []).map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded-full border border-amber-300 bg-white/80 px-2 py-1 text-[11px] text-amber-900"
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {review.replyText ? (
                    <div className="mt-3 rounded-lg border border-border-subtle bg-white/70 p-2 text-sm text-text-main">
                      <div className="text-xs uppercase tracking-wide text-text-sec">Master reply</div>
                      <div className="mt-1">{review.replyText}</div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!review.replyText ? (
                      <button
                        type="button"
                        onClick={() => void replyToReview(review)}
                        disabled={actionId === review.id}
                        className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        Reply
                      </button>
                    ) : null}
                    {canReportReview(review) ? (
                      <button
                        type="button"
                        onClick={() => void reportReview(review)}
                        disabled={actionId === review.id}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-60"
                      >
                        Report
                      </button>
                    ) : null}
                    {review.reportedAt ? (
                      <div className="text-xs text-text-sec">Reported {formatReviewDate(review.reportedAt)}</div>
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
