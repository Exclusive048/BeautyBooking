"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";

type FeedItem = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  masterId: string;
  masterName: string;
  masterAvatarUrl: string | null;
  studioName: string | null;
  serviceIds: string[];
  primaryServiceTitle: string | null;
  totalDurationMin: number;
  totalPrice: number;
  favoritesCount: number;
  isFavorited: boolean;
};

type NearestSlot = {
  startAt: string;
};

type PortfolioDetail = FeedItem & {
  serviceOptions: Array<{
    serviceId: string;
    title: string;
    durationMin: number;
    price: number;
  }>;
  nearestSlots: NearestSlot[];
  similarItems: Array<{
    id: string;
    mediaUrl: string;
    masterName: string;
    totalPrice: number;
  }>;
};

type FeedResponse = {
  items: FeedItem[];
  nextCursor: string | null;
};

const FEED_LIMIT = 24;
const SEARCH_DEBOUNCE_MS = 400;

const CATEGORY_OPTIONS = [
  { key: "nails", label: UI_TEXT.feed.categoryNails },
  { key: "hair", label: UI_TEXT.feed.categoryHair },
  { key: "brows", label: UI_TEXT.feed.categoryBrowsLashes },
  { key: "makeup", label: UI_TEXT.feed.categoryMakeup },
  { key: "body", label: UI_TEXT.feed.categoryBody },
] as const;

const TAG_OPTIONS = [
  { key: "trends", label: UI_TEXT.feed.tagTrends },
  { key: "nude", label: UI_TEXT.feed.tagNude },
  { key: "gradient", label: UI_TEXT.feed.tagGradient },
  { key: "near", label: UI_TEXT.feed.tagNearby },
] as const;


function formatDuration(min: number): string {
  if (min <= 0) return "";
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours > 0 && minutes > 0) return `${hours}ч ${minutes}м`;
  if (hours > 0) return `${hours}ч`;
  return `${minutes}м`;
}

function buildFeedUrl(params: {
  q?: string;
  category?: string;
  tag?: string;
  cursor?: string;
}): string {
  const query = new URLSearchParams();
  query.set("limit", String(FEED_LIMIT));
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("categoryId", params.category);
  if (params.tag) query.set("tag", params.tag);
  if (params.cursor) query.set("cursor", params.cursor);
  return `/api/feed/portfolio?${query.toString()}`;
}

export default function InspirationFeedClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewerTimeZone = useViewerTimeZoneContext();

  const selectedCategory = searchParams.get("category") ?? "";
  const selectedTag = searchParams.get("tag") ?? "";
  const selectedQuery = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(selectedQuery);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PortfolioDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const initialLoadedRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const queryState = useMemo(
    () => ({ q: selectedQuery, category: selectedCategory, tag: selectedTag }),
    [selectedCategory, selectedQuery, selectedTag]
  );

  const replaceSearchParams = useCallback(
    (next: { q?: string; category?: string; tag?: string }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.q !== undefined) {
        if (next.q.trim()) params.set("q", next.q.trim());
        else params.delete("q");
      }

      if (next.category !== undefined) {
        if (next.category) params.set("category", next.category);
        else params.delete("category");
      }

      if (next.tag !== undefined) {
        if (next.tag) params.set("tag", next.tag);
        else params.delete("tag");
      }

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    setSearchInput(selectedQuery);
  }, [selectedQuery]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchInput !== selectedQuery) {
        replaceSearchParams({ q: searchInput });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [replaceSearchParams, searchInput, selectedQuery]);

  const fetchFeed = useCallback(
    async (cursor?: string) => {
      const res = await fetch(
        buildFeedUrl({
          q: queryState.q || undefined,
          category: queryState.category || undefined,
          tag: queryState.tag || undefined,
          cursor,
        }),
        { cache: "no-store" }
      );

      const json = (await res.json().catch(() => null)) as ApiResponse<FeedResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.feed.loadFailed);
      }
      return json.data;
    },
    [queryState.category, queryState.q, queryState.tag]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchFeed();
        if (!cancelled) {
          setItems(data.items);
          setNextCursor(data.nextCursor);
          initialLoadedRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : UI_TEXT.feed.loadFailed);
        }
      } finally {
        if (!cancelled) setLoading(false);
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
      setError(err instanceof Error ? err.message : UI_TEXT.feed.loadFailed);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchFeed, loadingMore, nextCursor]);

  useEffect(() => {
    if (!loadMoreRef.current || !nextCursor || loadingMore) return;
    const node = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, loadingMore, nextCursor]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setDetailError(null);
      const res = await fetch(`/api/portfolio/${selectedId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ item: PortfolioDetail }> | null;
      if (!cancelled && res.ok && json && json.ok) {
        setSelectedItem(json.data.item);
        return;
      }
      if (!cancelled) {
        setSelectedItem(null);
        setDetailError(json && !json.ok ? json.error.message : UI_TEXT.feed.detailsFailed);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const onToggleFavorite = useCallback(async (itemId: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              isFavorited: !entry.isFavorited,
              favoritesCount: entry.isFavorited
                ? Math.max(0, entry.favoritesCount - 1)
                : entry.favoritesCount + 1,
            }
          : entry
      )
    );

    try {
      const res = await fetch(`/api/portfolio/${itemId}/favorite`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ isFavorited: boolean; favoritesCount: number }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.feed.loadFailed);
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === itemId
            ? {
                ...entry,
                isFavorited: json.data.isFavorited,
                favoritesCount: json.data.favoritesCount,
              }
            : entry
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.feed.loadFailed);
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === itemId
            ? {
                ...entry,
                isFavorited: !entry.isFavorited,
                favoritesCount: entry.isFavorited
                  ? Math.max(0, entry.favoritesCount - 1)
                  : entry.favoritesCount + 1,
              }
            : entry
        )
      );
    }
  }, []);

  const headerShadow = initialLoadedRef.current ? "shadow-card" : "";

  return (
    <div className="relative space-y-6">
      <header className={`sticky top-3 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8`}>
        <div
          className={`glass-panel mx-auto max-w-7xl overflow-hidden rounded-[28px] px-4 py-4 sm:px-5 ${headerShadow}`}
        >
          <div className="pointer-events-none absolute left-1/2 top-0 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute right-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-primary-magenta/18 blur-3xl" />

          <div className="relative space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-lg font-semibold text-text-main sm:text-xl">{UI_TEXT.feed.title}</h1>
              <div className="text-xs text-text-sec sm:text-sm">{UI_TEXT.feed.subtitle}</div>
            </div>

            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="lux-input w-full rounded-full px-5 py-2.5 text-sm outline-none transition focus-visible:shadow-glow"
              placeholder={UI_TEXT.feed.aiSearchPlaceholder}
            />

            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((option) => {
                const active = selectedCategory === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() =>
                      replaceSearchParams({ category: active ? "" : option.key })
                    }
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300 ${
                      active
                        ? "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-[rgb(var(--accent-foreground))] shadow-card"
                        : "border border-border-subtle/85 bg-bg-card/65 text-text-main hover:bg-bg-card"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((option) => {
                const active = selectedTag === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => replaceSearchParams({ tag: active ? "" : option.key })}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300 ${
                      active
                        ? "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-[rgb(var(--accent-foreground))] shadow-card"
                        : "border border-border-subtle/85 bg-bg-card/60 text-text-main hover:bg-bg-card"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {loading ? <div className="lux-card rounded-[24px] p-6 text-sm text-text-sec">{UI_TEXT.feed.loading}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {!loading && items.length === 0 ? (
        <div className="lux-card rounded-[24px] p-8 text-center text-sm text-text-sec">{UI_TEXT.feed.emptyFeed}</div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[30px] border border-border-subtle/80 bg-bg-card/95 shadow-card transition-all duration-300 hover:scale-[1.012] hover:shadow-hover"
            >
              <button type="button" onClick={() => setSelectedId(item.id)} className="block w-full text-left">
                <img
                  src={item.mediaUrl}
                  alt={item.caption ?? item.primaryServiceTitle ?? item.masterName}
                  className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </button>

              <div className="absolute left-3 top-3 rounded-full border border-white/30 bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                {item.totalPrice > 0 ? UI_FMT.priceLabel(item.totalPrice) : "—"}
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/35 to-transparent p-4 opacity-0 transition-all duration-300 group-hover:opacity-100">
                <div className="text-sm font-semibold text-white">{item.primaryServiceTitle ?? item.caption ?? item.masterName}</div>
                <div className="mt-1 text-xs text-white/90">
                  {formatDuration(item.totalDurationMin)}{item.totalPrice > 0 ? ` • ${UI_FMT.priceLabel(item.totalPrice)}` : ""}
                </div>
                <div className="mt-1 text-xs text-white/90">{UI_TEXT.feed.byMaster}: {item.masterName}</div>
                {item.studioName ? <div className="mt-0.5 text-xs text-white/80">{UI_TEXT.feed.byStudio}: {item.studioName}</div> : null}
                <div className="pointer-events-auto mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(item.id)}
                    title={item.isFavorited ? UI_TEXT.feed.removeFromFavorites : UI_TEXT.feed.addToFavorites}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/88 text-base text-neutral-900 backdrop-blur"
                  >
                    {item.isFavorited ? "❤" : "♡"}
                  </button>
                  <span className="text-xs text-white/90">{item.favoritesCount > 0 ? `🔥 ${item.favoritesCount}` : ""}</span>
                  <Link
                    href={`/book?portfolioId=${item.id}`}
                    className="ml-auto inline-flex items-center rounded-full border border-white/35 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-900 backdrop-blur transition hover:bg-white"
                  >
                    {UI_TEXT.feed.bookNow}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && nextCursor ? (
        <div className="flex justify-center pb-8">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border border-border-subtle bg-bg-card px-4 py-2 text-sm text-text-main transition-all duration-300 hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMore ? UI_TEXT.common.loading : UI_TEXT.feed.showMore}
          </button>
        </div>
      ) : null}
      <div ref={loadMoreRef} className="h-1 w-full" />

      {selectedId ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label={UI_TEXT.common.cancel} className="absolute inset-0 bg-black/55" onClick={() => setSelectedId(null)} />
          <div className="absolute inset-0 overflow-y-auto p-3 sm:p-6">
            <div className="mx-auto mt-4 w-full max-w-6xl rounded-2xl bg-white p-4 shadow-2xl sm:mt-8 sm:p-6">
              {detailError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{detailError}</div> : null}
              {selectedItem ? (
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <img
                      src={selectedItem.mediaUrl}
                      alt={selectedItem.caption ?? selectedItem.primaryServiceTitle ?? selectedItem.masterName}
                      className="max-h-[75vh] w-full rounded-xl object-contain"
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-neutral-500">{UI_TEXT.feed.byMaster}</div>
                      <div className="text-lg font-semibold text-neutral-900">{selectedItem.masterName}</div>
                      {selectedItem.studioName ? <div className="text-sm text-neutral-600">{selectedItem.studioName}</div> : null}
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{UI_TEXT.feed.whatOnPhoto}</div>
                      <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                        {selectedItem.serviceOptions.map((service) => (
                          <li key={service.serviceId}>
                            • {service.title} — {formatDuration(service.durationMin)} / {UI_FMT.priceLabel(service.price)}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-900">
                      <div className="font-semibold">{UI_TEXT.feed.total}</div>
                      <div className="mt-1">{formatDuration(selectedItem.totalDurationMin)} / {UI_FMT.priceLabel(selectedItem.totalPrice)}</div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{UI_TEXT.feed.nearestSlots}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedItem.nearestSlots.length === 0 ? (
                          <span className="text-sm text-neutral-500">{UI_TEXT.feed.noSlots}</span>
                        ) : (
                          selectedItem.nearestSlots.map((slot) => (
                            <span key={slot.startAt} className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-700">
                              {UI_FMT.dateTimeShort(slot.startAt, { timeZone: viewerTimeZone })}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/book?portfolioId=${selectedItem.id}`}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                    >
                      {UI_TEXT.feed.bookThisService}
                    </Link>
                  </div>
                </div>
              ) : null}

              {selectedItem && selectedItem.similarItems.length > 0 ? (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-neutral-900">{UI_TEXT.feed.similarWorks}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {selectedItem.similarItems.map((similar) => (
                      <button
                        key={similar.id}
                        type="button"
                        className="overflow-hidden rounded-xl border text-left"
                        onClick={() => setSelectedId(similar.id)}
                      >
                        <img src={similar.mediaUrl} alt={similar.masterName} className="h-24 w-full object-cover" />
                        <div className="p-2 text-xs">
                          <div className="truncate text-neutral-800">{similar.masterName}</div>
                          <div className="text-neutral-500">{UI_FMT.priceLabel(similar.totalPrice)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
