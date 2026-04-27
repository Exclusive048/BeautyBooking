"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import { FeedCard } from "@/features/home/components/feed-card";
import { FeedSkeleton, FeedSkeletonGrid } from "@/features/home/components/feed-skeleton";
import { RecentMastersSection } from "@/features/home/components/recent-masters-section";
import { fetchJson } from "@/lib/http/client";
import type { PortfolioFeedItem } from "@/lib/feed/portfolio.service";
import { UI_TEXT } from "@/lib/ui/text";

type FeedPage = {
  items: PortfolioFeedItem[];
  nextCursor: string | null;
};

type HomeFeedProps = {
  // Both props are accepted for compatibility with <HomePage>, but the
  // authenticated grid does not render auth-specific content (greeting was
  // intentionally removed). The parent already gates rendering by auth state.
  isAuthenticated: boolean;
  userName?: string | null;
};

const FEED_LIMIT = 24;

const getKey = (pageIndex: number, previousPageData: FeedPage | null) => {
  if (previousPageData && !previousPageData.nextCursor) return null;
  if (pageIndex === 0) return `/api/feed/portfolio?limit=${FEED_LIMIT}`;
  return `/api/feed/portfolio?limit=${FEED_LIMIT}&cursor=${previousPageData!.nextCursor}`;
};

const fetcher = (url: string) => fetchJson<FeedPage>(url);

export function HomeFeed(props: HomeFeedProps) {
  void props; // accepted for backward compat; see HomeFeedProps comment above
  const router = useRouter();
  const searchParams = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, size, setSize, isLoading, error, mutate } = useSWRInfinite<FeedPage>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  );

  const items = data?.flatMap((p) => p.items) ?? [];
  const lastPage = data && data.length > 0 ? data[data.length - 1] : null;
  const isReachingEnd = Boolean(lastPage && lastPage.nextCursor === null);
  const isLoadingMore =
    Boolean(isLoading) ||
    (size > 0 && data !== undefined && typeof data[size - 1] === "undefined");

  // Toast about deletion → strip ?deleted=1 once shown
  useEffect(() => {
    const deleted = searchParams.get("deleted");
    if (deleted !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToast(UI_TEXT.home.accountDeleted);
    const timer = window.setTimeout(() => setToast(null), 2400);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("deleted");
    const suffix = next.toString();
    router.replace(suffix ? `/?${suffix}` : "/");
    return () => window.clearTimeout(timer);
  }, [router, searchParams]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || isReachingEnd) return;
    const node = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          void setSize((prev) => prev + 1);
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isLoadingMore, isReachingEnd, setSize]);

  const isInitialLoading = isLoading && !data;
  const isEmpty = !isInitialLoading && !error && items.length === 0;

  const T = UI_TEXT.homeFeed;

  return (
    <div className="space-y-8">
      {/* TODO(04-STORIES): заменить на <StoriesRail /> */}
      <div className="h-[120px]" aria-hidden />

      <RecentMastersSection />

      {toast ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {toast}
        </div>
      ) : null}

      {error && !isInitialLoading ? (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div>
            <p className="font-medium">{T.error.title}</p>
            <p className="mt-0.5 text-xs opacity-80">{T.error.description}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void mutate()}>
            {T.error.retry}
          </Button>
        </div>
      ) : null}

      {isInitialLoading ? <FeedSkeletonGrid count={9} /> : null}

      {isEmpty ? (
        <div className="mx-auto max-w-md py-20 text-center">
          <h3 className="font-display text-2xl text-text-main">{T.empty.title}</h3>
          <p className="mt-2 text-sm text-text-sec">{T.empty.subtitle}</p>
          <div className="mt-6">
            <Button asChild variant="primary" size="lg">
              <Link href="/catalog">{T.empty.cta}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {!isInitialLoading && items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-5">
          {items.map((item, index) => (
            <FeedCard key={item.id} item={item} index={index} />
          ))}
        </div>
      ) : null}

      {/* Loading next page — three skeletons in a row */}
      {!isInitialLoading && isLoadingMore && !isReachingEnd ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <FeedSkeleton key={`more-${i}`} />
          ))}
        </div>
      ) : null}

      {/* Sentinel — only when there's more to load */}
      {!isReachingEnd && !isInitialLoading ? (
        <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
      ) : null}

      {/* End of feed */}
      {isReachingEnd && items.length > 0 ? (
        <p className="py-12 text-center font-display text-lg italic text-text-sec">
          {T.end}
        </p>
      ) : null}
    </div>
  );
}
