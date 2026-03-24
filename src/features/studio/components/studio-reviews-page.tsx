"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
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
const UI = {
  loadFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043e\u0442\u0437\u044b\u0432\u044b.",
  total: "\u0412\u0441\u0435\u0433\u043e",
  new: "\u041d\u043e\u0432\u044b\u0435",
  unanswered: "\u041d\u0435\u043e\u0442\u0432\u0435\u0447\u0435\u043d\u043d\u044b\u0435",
  all: "\u0412\u0441\u0435",
  loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043e\u0442\u0437\u044b\u0432\u043e\u0432...",
  emptyFilter: "\u041f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c\u0443 \u0444\u0438\u043b\u044c\u0442\u0440\u0443 \u043e\u0442\u0437\u044b\u0432\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.",
  noText: "\u0411\u0435\u0437 \u0442\u0435\u043a\u0441\u0442\u0430",
};

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
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setReviews(json.data.reviews);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : UI.loadFailed);
    } finally {
      if (!signal || !signal.aborted) {
        setLoading(false);
      }
    }
  }, [providerId]);

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

  const summaryText = `${UI.total}: ${reviews.length} \u2022 ${UI.new}: ${newCount} \u2022 ${UI.unanswered}: ${unansweredCount}`;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-bg-card/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-text-sec">{summaryText}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNextFilter("new")}
              className={`rounded-xl px-3 py-1.5 text-xs transition ${
                filter === "new" ? "bg-bg-input text-text-main" : "text-text-sec hover:text-text-main"
              }`}
            >
              {UI.new}
            </button>
            <button
              type="button"
              onClick={() => setNextFilter("unanswered")}
              className={`rounded-xl px-3 py-1.5 text-xs transition ${
                filter === "unanswered" ? "bg-bg-input text-text-main" : "text-text-sec hover:text-text-main"
              }`}
            >
              {UI.unanswered}
            </button>
            <button
              type="button"
              onClick={() => setNextFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-xs transition ${
                filter === "all" ? "bg-bg-input text-text-main" : "text-text-sec hover:text-text-main"
              }`}
            >
              {UI.all}
            </button>
          </div>
        </div>
      </section>

      {loading ? <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{UI.loading}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : null}

      {!loading && !error ? (
        <section className="lux-card rounded-[24px] p-4">
          <h3 className="mb-3 text-sm font-semibold">{UI_TEXT.studioCabinet.dashboard.cards.reviews}</h3>
          {filteredReviews.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-sec">
              {UI.emptyFilter}
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
                  <div className="mt-2 text-sm text-text-sec">{review.text?.trim() ? review.text : UI.noText}</div>
                  {review.publicTags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {review.publicTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full border border-border-subtle bg-white/10 px-2 py-1 text-[11px] text-text-sec"
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

