"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type MasterReview = {
  id: string;
  authorName: string;
  rating: number;
  text: string | null;
  createdAt: string;
};

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

export function MasterReviewsPage({ masterId }: Props) {
  const [reviews, setReviews] = useState<MasterReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("DATE_DESC");

  useEffect(() => {
    const controller = new AbortController();

    const loadReviews = async (): Promise<void> => {
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
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ reviews: MasterReview[] }>
          | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setReviews(json.data.reviews);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить отзывы");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadReviews();
    return () => controller.abort();
  }, [masterId]);

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

  return (
    <div className="space-y-4">
      <section className="lux-card rounded-[24px] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Статистика отзывов</h3>
            <p className="mt-1 text-sm text-text-sec">
              Всего: {reviews.length} · Средняя оценка: {averageRating.toFixed(1)}
            </p>
          </div>
          <label className="text-sm text-text-sec">
            Сортировка
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="DATE_ASC">По дате: от старых к новым</option>
              <option value="DATE_DESC">По дате: от новых к старым</option>
              <option value="RATING_ASC">По рейтингу: от 1 к 5</option>
              <option value="RATING_DESC">По рейтингу: от 5 к 1</option>
            </select>
          </label>
        </div>
      </section>

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка отзывов...</div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {!loading && !error ? (
        <section className="lux-card rounded-[24px] p-4">
          <h3 className="mb-3 text-sm font-semibold">Лента отзывов</h3>
          {sortedReviews.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-sec">
              Пока отзывов нет.
            </div>
          ) : (
            <div className="space-y-2">
              {sortedReviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-xl border border-border-subtle bg-bg-input/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{review.authorName}</div>
                    <div className="text-xs text-text-sec">
                      ⭐{review.rating} · {formatReviewDate(review.createdAt)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-text-sec">
                    {review.text?.trim() ? review.text : "Без комментария"}
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
