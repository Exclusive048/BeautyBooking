"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";
import type { ReviewDto } from "@/lib/reviews/types";

type ReviewFilter = "all" | "new" | "unanswered";

type Props = {
  providerId: string;
  initialFilter: ReviewFilter;
};

const NEW_REVIEW_WINDOW_DAYS = 7;

function normalizeFilter(value: string | null | undefined): ReviewFilter {
  if (value === "new" || value === "unanswered" || value === "all") {
    return value;
  }
  return "all";
}

function isReviewNew(review: ReviewDto, nowMs: number): boolean {
  const createdAtMs = new Date(review.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  const diffMs = nowMs - createdAtMs;
  return diffMs <= NEW_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function formatReviewDate(value: string, timeZone: string): string {
  return UI_FMT.dateTimeLong(value, { timeZone });
}

function buildStars(rating: number): string {
  const safe = Math.max(1, Math.min(5, Math.round(rating)));
  return "*".repeat(safe);
}

export function StudioReviewsPage({ providerId, initialFilter }: Props) {
  const t = UI_TEXT.studioCabinet.reviews;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewerTimeZone = useViewerTimeZoneContext();

  const [filter, setFilter] = useState<ReviewFilter>(() => initialFilter);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilter(normalizeFilter(searchParams.get("filter") ?? initialFilter));
  }, [initialFilter, searchParams]);

  const loadReviews = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        targetType: "studio",
        targetId: providerId,
        limit: "100",
        offset: "0",
      });
      const res = await fetch(`/api/reviews?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ reviews: ReviewDto[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
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
  }, [providerId, t.apiErrorPrefix, t.loadFailed]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReviews(controller.signal);
    return () => controller.abort();
  }, [loadReviews]);

  const newCount = useMemo(() => {
    const nowMs = Date.now();
    return reviews.filter((review) => isReviewNew(review, nowMs)).length;
  }, [reviews]);

  const unansweredCount = useMemo(
    () => reviews.filter((review) => !review.replyText || !review.replyText.trim()).length,
    [reviews]
  );

  const filteredReviews = useMemo(() => {
    const nowMs = Date.now();
    if (filter === "new") {
      return reviews.filter((review) => isReviewNew(review, nowMs));
    }
    if (filter === "unanswered") {
      return reviews.filter((review) => !review.replyText || !review.replyText.trim());
    }
    return reviews;
  }, [filter, reviews]);

  const setNextFilter = (nextFilter: ReviewFilter) => {
    setFilter(nextFilter);
    const params = new URLSearchParams(searchParams.toString());
    if (nextFilter === "all") {
      params.delete("filter");
    } else {
      params.set("filter", nextFilter);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const summaryText = `${t.total}: ${reviews.length} • ${t.new}: ${newCount} • ${t.unanswered}: ${unansweredCount}`;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-bg-card/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-text-sec">{summaryText}</div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setNextFilter("new")}
              variant={filter === "new" ? "secondary" : "ghost"}
              size="sm"
            >
              {t.new}
            </Button>
            <Button
              onClick={() => setNextFilter("unanswered")}
              variant={filter === "unanswered" ? "secondary" : "ghost"}
              size="sm"
            >
              {t.unanswered}
            </Button>
            <Button
              onClick={() => setNextFilter("all")}
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
            >
              {t.all}
            </Button>
          </div>
        </div>
      </section>

      {loading ? <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div> : null}
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}

      {!loading && !error ? (
        <section className="lux-card rounded-[24px] p-4">
          <h3 className="mb-3 text-sm font-semibold">{UI_TEXT.studioCabinet.dashboard.cards.reviews}</h3>
          {filteredReviews.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-sec">
              {t.emptyFilter}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredReviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-border-subtle bg-bg-input/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-text-main">{review.authorName}</div>
                    <div className="text-xs text-text-sec">
                      {buildStars(review.rating)} {formatReviewDate(review.createdAt, viewerTimeZone)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-text-sec">{review.text?.trim() ? review.text : t.noText}</div>
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
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
