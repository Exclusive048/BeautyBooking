"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CatalogCard } from "@/features/catalog2/components/catalog-card";
import { FilterChips } from "@/features/catalog2/components/filter-chips";
import { MapPlaceholder } from "@/features/catalog2/components/map-placeholder";
import { SearchCapsule } from "@/features/catalog2/components/search-capsule";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";

type EntityType = "all" | "master" | "studio";
type ViewMode = "list" | "map";

type CatalogSearchItem = {
  type: "master" | "studio";
  id: string;
  title: string;
  avatarUrl: string | null;
  ratingAvg: number;
  reviewsCount: number;
  photos: string[];
  minPrice: number | null;
  primaryService: {
    title: string;
    price: number;
    durationMin: number;
  } | null;
  nextSlot: { startAt: string } | null;
  todaySlotsCount?: number;
};

type CatalogSearchData = {
  items: CatalogSearchItem[];
  nextCursor: number | null;
};

const DEBOUNCE_MS = 400;

function parseEntityType(value: string | null): EntityType {
  if (value === "master" || value === "studio") return value;
  return "all";
}

function parseViewMode(value: string | null): ViewMode {
  return value === "map" ? "map" : "list";
}

function mergeUnique(prev: CatalogSearchItem[], next: CatalogSearchItem[]): CatalogSearchItem[] {
  const map = new Map<string, CatalogSearchItem>();
  for (const item of prev) map.set(item.id, item);
  for (const item of next) map.set(item.id, item);
  return Array.from(map.values());
}

function CatalogSkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-[28px] border border-border-subtle/80 bg-bg-card shadow-card">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-8 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CatalogPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const serviceQuery = searchParams.get("serviceQuery") ?? "";
  const district = searchParams.get("district") ?? "";
  const date = searchParams.get("date") ?? "";
  const priceMin = searchParams.get("priceMin") ?? "";
  const priceMax = searchParams.get("priceMax") ?? "";
  const availableToday = searchParams.get("availableToday") === "true";
  const rating45plus = searchParams.get("ratingMin") === "4.5";
  const entityType = parseEntityType(searchParams.get("entityType"));
  const view = parseViewMode(searchParams.get("view"));
  const todayIso = new Date().toISOString().slice(0, 10);
  const isTodaySelected = date === todayIso;
  const effectiveAvailableToday = availableToday || isTodaySelected;

  const [draftServiceQuery, setDraftServiceQuery] = useState(serviceQuery);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogSearchData>({ items: [], nextCursor: null });

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value.length === 0) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftServiceQuery !== serviceQuery) {
        updateParams({ serviceQuery: draftServiceQuery });
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draftServiceQuery, serviceQuery, updateParams]);

  const onSubmit = useCallback(() => {
    updateParams({ serviceQuery: draftServiceQuery, district, date });
  }, [date, district, draftServiceQuery, updateParams]);

  const requestCatalog = useCallback(
    async (cursor?: number): Promise<CatalogSearchData> => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (serviceQuery) params.set("serviceQuery", serviceQuery);
      if (district) params.set("district", district);
      if (date) params.set("date", date);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      if (effectiveAvailableToday) params.set("availableToday", "true");
      if (rating45plus) params.set("ratingMin", "4.5");
      if (entityType !== "all") params.set("entityType", entityType);
      if (typeof cursor === "number") params.set("cursor", String(cursor));

      const res = await fetch(`/api/catalog/search?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<CatalogSearchData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.catalog.loadFailed);
      }
      return json.data;
    },
    [date, district, effectiveAvailableToday, entityType, priceMax, priceMin, rating45plus, serviceQuery]
  );

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    try {
      const next = await requestCatalog();
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : UI_TEXT.catalog.loadFailed);
      setData({ items: [], nextCursor: null });
    } finally {
      setLoading(false);
    }
  }, [requestCatalog]);

  const loadMore = useCallback(async () => {
    if (loadingMore || data.nextCursor === null) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = await requestCatalog(data.nextCursor);
      setData((prev) => ({
        items: mergeUnique(prev.items, next.items),
        nextCursor: next.nextCursor,
      }));
    } catch (e) {
      setLoadMoreError(e instanceof Error ? e.message : UI_TEXT.catalog.loadFailed);
    } finally {
      setLoadingMore(false);
    }
  }, [data.nextCursor, loadingMore, requestCatalog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchCatalog();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCatalog]);

  const resultCount = useMemo(() => data.items.length, [data.items.length]);
  const mapPoints = useMemo(
    () =>
      data.items.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
      })),
    [data.items]
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <div className="sticky top-16 z-20 space-y-3 rounded-2xl border border-border bg-background/95 p-3 backdrop-blur">
        <SearchCapsule
          serviceQuery={draftServiceQuery}
          district={district}
          date={date}
          onServiceQueryChange={setDraftServiceQuery}
          onDistrictChange={(value) => updateParams({ district: value })}
          onDateChange={(value) => updateParams({ date: value })}
          onSubmit={onSubmit}
        />
        <FilterChips
          availableToday={effectiveAvailableToday}
          rating45plus={rating45plus}
          entityType={entityType}
          priceMin={priceMin}
          priceMax={priceMax}
          onToggleAvailableToday={() => updateParams({ availableToday: availableToday ? null : "true" })}
          onToggleRating45plus={() => updateParams({ ratingMin: rating45plus ? null : "4.5" })}
          onEntityTypeChange={(value) => updateParams({ entityType: value === "all" ? null : value })}
          onPriceApply={(nextMin, nextMax) =>
            updateParams({
              priceMin: nextMin.length > 0 ? nextMin : null,
              priceMax: nextMax.length > 0 ? nextMax : null,
            })
          }
          onPriceReset={() => updateParams({ priceMin: null, priceMax: null })}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card/80 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {UI_TEXT.catalog.resultsCount}: <span className="font-semibold text-foreground">{resultCount}</span>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => updateParams({ view: "list" })}
            className={
              view === "list"
                ? "rounded-full bg-foreground px-3 py-1 text-sm text-background"
                : "rounded-full px-3 py-1 text-sm text-foreground"
            }
          >
            {UI_TEXT.catalog.viewList}
          </button>
          <button
            type="button"
            onClick={() => updateParams({ view: "map" })}
            className={
              view === "map"
                ? "rounded-full bg-foreground px-3 py-1 text-sm text-background"
                : "rounded-full px-3 py-1 text-sm text-foreground"
            }
          >
            {UI_TEXT.catalog.viewMap}
          </button>
        </div>
      </div>

      {loading ? <CatalogSkeletonGrid /> : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          <div>{error}</div>
          <button type="button" onClick={() => void fetchCatalog()} className="mt-3 rounded-full border border-red-300 px-4 py-2 text-sm">
            {UI_TEXT.catalog.retry}
          </button>
        </div>
      ) : null}

      {!loading && !error && data.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
          <div className="text-base font-semibold text-foreground">{UI_TEXT.catalog.emptyTitle}</div>
          <div className="mt-2 text-sm text-muted-foreground">{UI_TEXT.catalog.emptyDesc}</div>
        </div>
      ) : null}

      {!loading && !error && data.items.length > 0 ? (
        <div className={view === "map" ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" : ""}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => (
              <CatalogCard key={item.id} item={item} serviceQuery={serviceQuery} />
            ))}
          </div>
          {view === "map" ? (
            <aside className="hidden lg:block">
              <div className="sticky top-36">
                <MapPlaceholder points={mapPoints} />
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && data.nextCursor !== null ? (
        <div className="space-y-2 pt-2 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground disabled:opacity-60"
          >
            {loadingMore ? UI_TEXT.common.loading : UI_TEXT.catalog.loadMore}
          </button>
          {loadMoreError ? <div className="text-xs text-red-600">{loadMoreError}</div> : null}
        </div>
      ) : null}

      {view === "map" ? (
        <div className="fixed inset-0 z-40 bg-black/50 p-4 lg:hidden">
          <div className="mx-auto flex h-full max-w-lg flex-col rounded-2xl border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-foreground">{UI_TEXT.catalog.viewMap}</div>
              <button
                type="button"
                onClick={() => updateParams({ view: "list" })}
                className="rounded-full border border-border px-3 py-1 text-sm text-foreground"
              >
                {UI_TEXT.common.cancel}
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <MapPlaceholder points={mapPoints} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
