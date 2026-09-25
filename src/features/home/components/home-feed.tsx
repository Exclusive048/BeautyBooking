"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import { FeedCollage, useCollageColumns } from "@/features/home/components/feed-collage";
import { FeedCollageSkeleton } from "@/features/home/components/feed-skeleton";
import { RecentMastersSection } from "@/features/home/components/recent-masters-section";
import { StoriesRail } from "@/features/home/components/stories-rail";
import { StoriesViewerOverlayLazy } from "@/features/home/components/stories-viewer-overlay-lazy";
import { StoriesViewerProvider } from "@/features/home/stories-viewer-context";
import { fetchJson } from "@/lib/http/client";
import type { HomeFeedGroup, HomeFeedPage } from "@/lib/feed/home-feed.service";
import { UI_TEXT } from "@/lib/ui/text";

type FeedPage = HomeFeedPage;

type HomeFeedProps = {
  // `isAuthenticated` решает, что делает сердце на плитке (гостя — на вход).
  // `userName` принимается для совместимости с <HomePage>: приветствие убрано.
  isAuthenticated: boolean;
  userName?: string | null;
};

/** HOME-FEED-COLLAGE: страница — в плитках-группах (6 колонок × 3 ряда на ПК). */
const FEED_LIMIT = 18;

const getKey = (pageIndex: number, previousPageData: FeedPage | null) => {
  if (previousPageData && !previousPageData.nextCursor) return null;
  if (pageIndex === 0) return `/api/feed/home?limit=${FEED_LIMIT}`;
  return `/api/feed/home?limit=${FEED_LIMIT}&cursor=${encodeURIComponent(previousPageData!.nextCursor!)}`;
};

/** Группа не должна прийти дважды, но ключ — страховка от повтора плитки. */
function uniqueGroups(pages: FeedPage[] | undefined): HomeFeedGroup[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: HomeFeedGroup[] = [];
  for (const page of pages) {
    for (const group of page.groups) {
      if (seen.has(group.key)) continue;
      seen.add(group.key);
      out.push(group);
    }
  }
  return out;
}

const fetcher = (url: string) => fetchJson<FeedPage>(url);

export function HomeFeed({ isAuthenticated }: HomeFeedProps) {
  const router = useRouter();
  const columns = useCollageColumns();
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

  const groups = uniqueGroups(data);
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
  const isEmpty = !isInitialLoading && !error && groups.length === 0;

  const T = UI_TEXT.homeFeed;

  return (
    <StoriesViewerProvider>
    <div className="space-y-8">
      <StoriesRail />
      <StoriesViewerOverlayLazy />

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

      {isInitialLoading ? <FeedCollageSkeleton count={columns * 3} columns={columns} /> : null}

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

      {!isInitialLoading && groups.length > 0 ? (
        // HOME-FEED-COLLAGE: коллаж плиток-групп; 3 колонки на телефоне, 6 на ПК.
        <FeedCollage groups={groups} columns={columns} isAuthenticated={isAuthenticated} />
      ) : null}

      {/* Loading next page — one row of skeletons */}
      {!isInitialLoading && isLoadingMore && !isReachingEnd ? (
        <FeedCollageSkeleton count={columns} columns={columns} />
      ) : null}

      {/* Sentinel — only when there's more to load */}
      {!isReachingEnd && !isInitialLoading ? (
        <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
      ) : null}

      {/* End of feed */}
      {isReachingEnd && groups.length > 0 ? (
        <p className="py-12 text-center font-display text-lg italic text-text-sec">
          {T.end}
        </p>
      ) : null}
    </div>
    </StoriesViewerProvider>
  );
}
