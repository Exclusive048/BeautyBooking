"use client";

import { useCallback, useEffect, useState } from "react";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.admin.reviews;

type ReviewItem = {
  id: string;
  rating: number;
  text: string | null;
  replyText: string | null;
  reportedAt: string | null;
  reportReason: string | null;
  reportComment: string | null;
  createdAt: string;
  targetType: string;
  targetName: string | null;
  author: {
    id: string;
    displayName: string | null;
    phone: string | null;
    email: string | null;
  };
};

type ReviewsResponse = {
  reviews: ReviewItem[];
  nextCursor: string | null;
};

function formatDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
}

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export function AdminReviews() {
  const viewerTimeZone = useViewerTimeZoneContext();

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reportedOnly, setReportedOnly] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const buildUrl = (cursor?: string | null) => {
    const params = new URLSearchParams({ limit: "50" });
    if (reportedOnly) params.set("reported", "true");
    if (cursor) params.set("cursor", cursor);
    return `/api/admin/reviews?${params.toString()}`;
  };

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const url = reset ? buildUrl() : buildUrl(nextCursor);
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<ReviewsResponse> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.errors.load);
        }
        if (reset) setReviews(json.data.reviews);
        else setReviews((prev) => [...prev, ...json.data.reviews]);
        setNextCursor(json.data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.errors.load);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportedOnly, nextCursor]
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportedOnly]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t.confirmDelete)) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.delete);
      }
      setReviews((prev) => prev.filter((r) => r.id !== id));
      setToast(t.deleted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.delete);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setDismissingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_report" }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.dismiss);
      }
      setReviews((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, reportedAt: null, reportReason: null, reportComment: null } : r
        )
      );
      setToast(t.dismissed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.dismiss);
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
      </header>

      {toast ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Switch checked={reportedOnly} onCheckedChange={setReportedOnly} />
        <span className="text-sm text-text-sec">{t.filterReported}</span>
      </div>

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">{t.table.author}</th>
                  <th className="px-4 py-3 text-left">{t.table.target}</th>
                  <th className="px-4 py-3 text-left">{t.table.rating}</th>
                  <th className="px-4 py-3 text-left">{t.table.text}</th>
                  <th className="px-4 py-3 text-left">{t.table.date}</th>
                  <th className="px-4 py-3 text-left">{t.table.reported}</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {reviews.length > 0 ? (
                  reviews.map((review, i) => (
                    <tr key={review.id} className={i % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                      <td className="px-4 py-3 text-sm text-text-main">
                        <div>{review.author.displayName || "—"}</div>
                        <div className="text-xs text-text-sec tabular-nums">
                          {review.author.phone || review.author.email || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">
                        <div className="text-xs text-text-sec/70">{review.targetType}</div>
                        <div>{review.targetName || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-amber-500">
                        {stars(review.rating)}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-sm text-text-sec">
                        <div className="line-clamp-2">{review.text || "—"}</div>
                        {review.replyText ? (
                          <div className="mt-1 line-clamp-1 text-xs text-text-sec/70 italic">
                            ↳ {review.replyText}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-text-sec">
                        {formatDate(review.createdAt, viewerTimeZone)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {review.reportedAt ? (
                          <div className="space-y-0.5">
                            <div className="text-red-600 dark:text-red-400">
                              {formatDate(review.reportedAt, viewerTimeZone)}
                            </div>
                            {review.reportReason ? (
                              <div className="text-xs text-text-sec">
                                {t.reportReason} {review.reportReason}
                              </div>
                            ) : null}
                            {review.reportComment ? (
                              <div className="max-w-[180px] truncate text-xs text-text-sec/70 italic">
                                {review.reportComment}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-text-sec">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {review.reportedAt ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleDismiss(review.id)}
                              disabled={dismissingId === review.id || deletingId === review.id}
                            >
                              {t.dismissReport}
                            </Button>
                          ) : null}
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void handleDelete(review.id)}
                            disabled={deletingId === review.id || dismissingId === review.id}
                          >
                            {t.delete}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-sec">
                      {t.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {nextCursor ? (
            <div className="border-t border-border-subtle/60 px-4 py-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void load(false)}
                disabled={loadingMore}
              >
                {loadingMore ? t.loadingMore : t.loadMore}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
