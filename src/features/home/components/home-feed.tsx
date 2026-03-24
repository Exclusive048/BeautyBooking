"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PortfolioFeedItem } from "@/lib/feed/portfolio.service";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { HomeFilters } from "@/features/home/components/home-filters";
import { PortfolioGrid } from "@/features/home/components/portfolio-grid";
import { PortfolioPreviewModal } from "@/features/home/components/portfolio-preview-modal";

type HomeCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  usageCount: number;
  parentId: string | null;
};

type CatalogCategory = {
  id: string;
  title: string;
  slug: string | null;
  icon: string | null;
  parentId: string | null;
  usageCount: number;
};

type HomeFeedResponse = {
  items: PortfolioFeedItem[];
  nextCursor: string | null;
};

const FEED_LIMIT = 24;
const CATEGORY_CHIPS_LIMIT = 8;

function buildFeedUrl(params: {
  cursor?: string | null;
  globalCategoryId?: string | null;
}) {
  const query = new URLSearchParams();
  query.set("limit", String(FEED_LIMIT));
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.globalCategoryId) query.set("globalCategoryId", params.globalCategoryId);
  return `/api/home/feed?${query.toString()}`;
}

export function HomeFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [items, setItems] = useState<PortfolioFeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchFeed = useCallback(
    async (cursor?: string | null) => {
      const res = await fetch(
        buildFeedUrl({
          cursor,
          globalCategoryId: activeCategory,
        }),
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => null)) as ApiResponse<HomeFeedResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.home.loadFailed);
      }
      return json.data;
    },
    [activeCategory]
  );

  useEffect(() => {
    const deleted = searchParams.get("deleted");
    if (deleted !== "1") return;
    setToast("Ваш аккаунт удалён");
    const timer = window.setTimeout(() => setToast(null), 2400);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("deleted");
    const suffix = next.toString();
    router.replace(suffix ? `/?${suffix}` : "/");
    return () => window.clearTimeout(timer);
  }, [router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/catalog/global-categories?status=APPROVED", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ categories: CatalogCategory[] } | CatalogCategory[]>
          | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : UI_TEXT.home.loadFailed);
        }
        const payload = Array.isArray(json.data) ? json.data : (json.data?.categories ?? []);
        if (!cancelled) {
          setCategories(
            payload
              .filter((item) => item.parentId === null)
              .slice(0, CATEGORY_CHIPS_LIMIT)
              .map((item) => ({
                id: item.id,
                name: item.title,
                slug: item.slug ?? item.id,
                icon: item.icon,
                usageCount: item.usageCount,
                parentId: item.parentId,
              }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : UI_TEXT.home.loadFailed);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setNextCursor(null);

    (async () => {
      try {
        const data = await fetchFeed(null);
        if (!cancelled) {
          setItems(data.items);
          setNextCursor(data.nextCursor);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : UI_TEXT.home.loadFailed);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchFeed]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await fetchFeed(nextCursor);
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.home.loadFailed);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchFeed, loadingMore, nextCursor]);

  useEffect(() => {
    if (!loadMoreRef.current || loading || !nextCursor) return;
    const node = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, loading, nextCursor]);

  return (
    <div className="space-y-6">
      <HomeFilters
        categories={categories}
        selectedCategoryId={activeCategory}
        onSelectCategory={(next) => setActiveCategory(next)}
      />

      {toast ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {toast}
        </div>
      ) : null}

      {loading ? (
        <div className="lux-card rounded-[24px] p-6 text-sm text-text-sec">{UI_TEXT.home.loading}</div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <div className="lux-card rounded-[24px] p-8 text-center text-sm text-text-sec">{UI_TEXT.home.empty}</div>
      ) : null}

      {!loading && items.length > 0 ? (
        <PortfolioGrid items={items} onSelect={(id) => setSelectedItemId(id)} />
      ) : null}

      {nextCursor ? (
        <div className="flex justify-center pb-6">
          <div ref={loadMoreRef} className="h-8 w-8" />
        </div>
      ) : null}

      <PortfolioPreviewModal
        itemId={selectedItemId}
        open={Boolean(selectedItemId)}
        onClose={() => setSelectedItemId(null)}
      />
    </div>
  );
}
