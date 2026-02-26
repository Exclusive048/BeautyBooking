"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import { FilterChips } from "@/features/catalog/components/filter-chips";
import { CatalogMap } from "@/features/catalog/components/catalog-map";
import { CatalogMapSidebar } from "@/features/catalog/components/catalog-map-sidebar";
import type { CatalogMapPoint } from "@/features/catalog/types";
import { DateTimeFilterBar } from "@/features/search-by-time/components/date-time-filter-bar";
import { ProviderResultCard } from "@/features/search-by-time/components/provider-result-card";
import type { TimePreset } from "@/features/search-by-time/components/time-preset-chips";
import type { AvailabilitySearchResponse } from "@/lib/search-by-time/types";
import { providerPublicUrl } from "@/lib/public-urls";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";

type EntityType = "all" | "master" | "studio";
type ViewMode = "list" | "map";
type SmartTagPreset = "rush" | "relax" | "design" | "safe" | "silent";
type TimePresetValue = "morning" | "day" | "evening";

type CatalogSearchItem = {
  type: "master" | "studio";
  id: string;
  publicUsername: string | null;
  title: string;
  avatarUrl: string | null;
  avatarFocalX: number | null;
  avatarFocalY: number | null;
  ratingAvg: number;
  reviewsCount: number;
  photos: string[];
  geoLat: number | null;
  geoLng: number | null;
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

type AvailabilitySearchData = AvailabilitySearchResponse;

type MapSearchState = {
  bbox: string;
  center: { lat: number; lng: number };
} | null;

type MapSearchSource = "auto" | "manual";

type MapSidebarItem = {
  id: string;
  title: string;
  type: "master" | "studio";
  avatarUrl: string | null;
  avatarFocalX: number | null;
  avatarFocalY: number | null;
  ratingAvg: number;
  priceFrom: number | null;
  href: string | null;
};

const DEBOUNCE_MS = 400;
const TIME_SEARCH_DEBOUNCE_MS = 200;

const TIME_PRESET_RANGES: Record<TimePresetValue, { from: string; to: string }> = {
  morning: { from: "09:00", to: "12:00" },
  day: { from: "12:00", to: "18:00" },
  evening: { from: "18:00", to: "22:00" },
};

function parseEntityType(value: string | null): EntityType {
  if (value === "master" || value === "studio") return value;
  return "all";
}

function parseViewMode(value: string | null): ViewMode {
  return value === "map" ? "map" : "list";
}

function parseSmartTag(value: string | null): SmartTagPreset | null {
  if (value === "rush" || value === "relax" || value === "design" || value === "safe" || value === "silent") {
    return value;
  }
  return null;
}

function parseTimePreset(value: string | null): TimePresetValue | null {
  if (value === "morning" || value === "day" || value === "evening") return value;
  return null;
}

function mergeUnique(prev: CatalogSearchItem[], next: CatalogSearchItem[]): CatalogSearchItem[] {
  const map = new Map<string, CatalogSearchItem>();
  for (const item of prev) map.set(item.id, item);
  for (const item of next) map.set(item.id, item);
  return Array.from(map.values());
}

function toMapPoint(
  item: CatalogSearchItem | AvailabilitySearchData["items"][number]
): CatalogMapPoint | null {
  if ("providerId" in item) {
    if (typeof item.geoLat !== "number" || typeof item.geoLng !== "number") return null;
    return {
      id: item.providerId,
      title: item.name,
      type: item.providerType === "STUDIO" ? "studio" : "master",
      avatarUrl: item.avatarUrl,
      avatarFocalX: item.avatarFocalX,
      avatarFocalY: item.avatarFocalY,
      ratingAvg: item.ratingAvg,
      priceFrom: item.priceFrom,
      publicUsername: item.publicUsername ?? null,
      geoLat: item.geoLat,
      geoLng: item.geoLng,
    };
  }

  if (typeof item.geoLat !== "number" || typeof item.geoLng !== "number") return null;
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    avatarUrl: item.avatarUrl,
    avatarFocalX: item.avatarFocalX,
    avatarFocalY: item.avatarFocalY,
    ratingAvg: item.ratingAvg,
    priceFrom: item.minPrice,
    publicUsername: item.publicUsername ?? null,
    geoLat: item.geoLat,
    geoLng: item.geoLng,
  };
}

function toSidebarItem(point: CatalogMapPoint): MapSidebarItem {
  return {
    id: point.id,
    title: point.title,
    type: point.type,
    avatarUrl: point.avatarUrl,
    avatarFocalX: point.avatarFocalX ?? null,
    avatarFocalY: point.avatarFocalY ?? null,
    ratingAvg: point.ratingAvg,
    priceFrom: point.priceFrom,
    href: providerPublicUrl({ id: point.id, publicUsername: point.publicUsername }, "catalog-map-sidebar"),
  };
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

export default function CatalogPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const serviceQuery = searchParams.get("serviceQuery") ?? "";
  const serviceId = searchParams.get("serviceId") ?? "";
  const district = searchParams.get("district") ?? "";
  const date = searchParams.get("date") ?? "";
  const timePresetRaw = parseTimePreset(searchParams.get("timePreset"));
  const timeFrom = searchParams.get("timeFrom") ?? "";
  const timeTo = searchParams.get("timeTo") ?? "";
  const priceMin = searchParams.get("priceMin") ?? "";
  const priceMax = searchParams.get("priceMax") ?? "";
  const availableToday = searchParams.get("availableToday") === "true";
  const rating45plus = searchParams.get("ratingMin") === "4.5";
  const hot = searchParams.get("hot") === "true";
  const smartTag = parseSmartTag(searchParams.get("smartTag"));
  const entityType = parseEntityType(searchParams.get("entityType"));
  const view = parseViewMode(searchParams.get("view"));
  const todayIso = new Date().toISOString().slice(0, 10);
  const isTodaySelected = date === todayIso;
  const effectiveAvailableToday = availableToday || isTodaySelected;
  const presetRange = timePresetRaw ? TIME_PRESET_RANGES[timePresetRaw] : null;
  const effectiveTimeFrom = timeFrom || presetRange?.from || "";
  const effectiveTimeTo = timeTo || presetRange?.to || "";
  const timePreset: TimePreset | null =
    timePresetRaw ?? (effectiveTimeFrom && effectiveTimeTo ? "custom" : null);
  const hasTimeRange = Boolean(effectiveTimeFrom && effectiveTimeTo);
  const needsService = hasTimeRange && !serviceId;
  const needsDate = hasTimeRange && !date;
  const timeModeActive = hasTimeRange && !needsService && !needsDate;

  const [draftServiceQuery, setDraftServiceQuery] = useState(serviceQuery);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogSearchData>({ items: [], nextCursor: null });
  const [mapSearch, setMapSearch] = useState<MapSearchState>(null);
  const [mapSearchApplied, setMapSearchApplied] = useState(false);
  const [mapSidebarItems, setMapSidebarItems] = useState<MapSidebarItem[]>([]);
  const [mapSidebarOpen, setMapSidebarOpen] = useState(false);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);

  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityData, setAvailabilityData] = useState<AvailabilitySearchData>({ items: [] });
  const availabilityAbortRef = useRef<AbortController | null>(null);
  const availabilityRequestIdRef = useRef(0);
  const skipCatalogFetchRef = useRef(false);

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

  useEffect(() => {
    setDraftServiceQuery(serviceQuery);
  }, [serviceQuery]);

  const onSubmit = useCallback(() => {
    updateParams({ serviceQuery: draftServiceQuery, district, date });
  }, [date, district, draftServiceQuery, updateParams]);

  const onServiceQueryInput = useCallback(
    (value: string) => {
      setDraftServiceQuery(value);
      if (serviceId) {
        updateParams({ serviceId: null });
      }
    },
    [serviceId, updateParams]
  );

  const requestCatalog = useCallback(
    async (cursor?: number, overrideMapSearch?: MapSearchState): Promise<CatalogSearchData> => {
      const params = new URLSearchParams();
      const activeMapSearch = overrideMapSearch ?? mapSearch;
      params.set("limit", "20");
      if (serviceQuery) params.set("serviceQuery", serviceQuery);
      if (district) params.set("district", district);
      if (date) params.set("date", date);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      if (effectiveAvailableToday) params.set("availableToday", "true");
      if (rating45plus) params.set("ratingMin", "4.5");
      if (hot) params.set("hot", "true");
      if (smartTag) params.set("smartTag", smartTag);
      if (entityType !== "all") params.set("entityType", entityType);
      if (typeof cursor === "number") params.set("cursor", String(cursor));
      if (activeMapSearch) {
        params.set("lat", String(activeMapSearch.center.lat));
        params.set("lng", String(activeMapSearch.center.lng));
        params.set("bbox", activeMapSearch.bbox);
      }

      const res = await fetch(`/api/catalog/search?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<CatalogSearchData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.catalog.loadFailed);
      }
      return json.data;
    },
    [
      date,
      district,
      effectiveAvailableToday,
      entityType,
      hot,
      mapSearch,
      priceMax,
      priceMin,
      rating45plus,
      serviceQuery,
      smartTag,
    ]
  );

  const requestAvailability = useCallback(
    async (signal?: AbortSignal): Promise<AvailabilitySearchData> => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (serviceId) params.set("serviceId", serviceId);
      if (date) params.set("date", date);
      if (effectiveTimeFrom) params.set("timeFrom", effectiveTimeFrom);
      if (effectiveTimeTo) params.set("timeTo", effectiveTimeTo);
      if (district) params.set("district", district);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      if (effectiveAvailableToday) params.set("availableToday", "true");
      if (rating45plus) params.set("ratingMin", "4.5");
      if (hot) params.set("hot", "true");
      if (smartTag) params.set("smartTag", smartTag);
      if (entityType !== "all") params.set("entityType", entityType);

      const res = await fetch(`/api/search/availability?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<AvailabilitySearchData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.catalog.timeSearch.loadFailed);
      }
      return json.data;
    },
    [
      date,
      district,
      effectiveAvailableToday,
      effectiveTimeFrom,
      effectiveTimeTo,
      entityType,
      hot,
      priceMax,
      priceMin,
      rating45plus,
      serviceId,
      smartTag,
    ]
  );

  const applyMapSearch = useCallback(
    async (nextMapSearch: MapSearchState, source: MapSearchSource) => {
      skipCatalogFetchRef.current = true;
      setMapSearch(nextMapSearch);
      setMapSearchApplied(source === "manual");
      setLoading(true);
      setError(null);
      setLoadMoreError(null);
      try {
        const next = await requestCatalog(undefined, nextMapSearch);
        setData(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : UI_TEXT.catalog.loadFailed);
        setData({ items: [], nextCursor: null });
      } finally {
        setLoading(false);
      }
    },
    [requestCatalog]
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

  const fetchAvailability = useCallback(async () => {
    const requestId = availabilityRequestIdRef.current + 1;
    availabilityRequestIdRef.current = requestId;
    availabilityAbortRef.current?.abort();
    const controller = new AbortController();
    availabilityAbortRef.current = controller;

    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const next = await requestAvailability(controller.signal);
      if (controller.signal.aborted || requestId !== availabilityRequestIdRef.current) return;
      setAvailabilityData(next);
    } catch (e) {
      if (controller.signal.aborted || requestId !== availabilityRequestIdRef.current) return;
      setAvailabilityError(e instanceof Error ? e.message : UI_TEXT.catalog.timeSearch.loadFailed);
      setAvailabilityData({ items: [] });
    } finally {
      if (!controller.signal.aborted && requestId === availabilityRequestIdRef.current) {
        setAvailabilityLoading(false);
      }
    }
  }, [requestAvailability]);

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
      if (cancelled || timeModeActive) return;
      if (skipCatalogFetchRef.current) {
        skipCatalogFetchRef.current = false;
        return;
      }
      await fetchCatalog();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCatalog, timeModeActive]);

  useEffect(() => {
    if (!timeModeActive) return;
    const timer = window.setTimeout(() => {
      void fetchAvailability();
    }, TIME_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fetchAvailability, timeModeActive]);

  const currentItems = timeModeActive ? availabilityData.items : data.items;
  const currentLoading = timeModeActive ? availabilityLoading : loading;
  const currentError = timeModeActive ? availabilityError : error;

  const resultCount = useMemo(() => currentItems.length, [currentItems.length]);
  const mapPoints = useMemo(
    () =>
      currentItems
        .map((item) => toMapPoint(item))
        .filter((item): item is CatalogMapPoint => Boolean(item)),
    [currentItems]
  );
  const missingMapCount = useMemo(
    () =>
      currentItems.reduce((count, item) => {
        const lat = item.geoLat;
        const lng = item.geoLng;
        const hasCoords =
          typeof lat === "number" &&
          Number.isFinite(lat) &&
          typeof lng === "number" &&
          Number.isFinite(lng);
        return count + (hasCoords ? 0 : 1);
      }, 0),
    [currentItems]
  );

  const handleClusterSelect = useCallback((items: CatalogMapPoint[]) => {
    setMapSidebarItems(items.map(toSidebarItem));
    setMapSidebarOpen(true);
  }, []);

  const closeMapSidebar = useCallback(() => {
    setMapSidebarOpen(false);
    setMapSidebarItems([]);
    setActiveMapId(null);
  }, []);

  useEffect(() => {
    if (view !== "map") {
      closeMapSidebar();
    }
  }, [closeMapSidebar, view]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <div className="top-16 z-20 mx-auto w-full max-w-5xl space-y-4 rounded-2xl border border-border bg-background/95 p-4 backdrop-blur">
        <DateTimeFilterBar
          serviceQuery={draftServiceQuery}
          serviceId={serviceId}
          district={district}
          date={date}
          timePreset={timePreset}
          timeFrom={effectiveTimeFrom}
          timeTo={effectiveTimeTo}
          onServiceQueryChange={onServiceQueryInput}
          onServiceSelect={(service) => {
            setDraftServiceQuery(service.title);
            updateParams({ serviceQuery: service.title, serviceId: service.id });
          }}
          onDistrictChange={(value) => updateParams({ district: value })}
          onDateChange={(value) => updateParams({ date: value })}
          onPresetChange={(preset, from, to) =>
            updateParams({ timePreset: preset, timeFrom: from, timeTo: to })
          }
          onCustomTimeChange={(from, to) => updateParams({ timePreset: null, timeFrom: from, timeTo: to })}
          onClearTime={() => updateParams({ timePreset: null, timeFrom: null, timeTo: null })}
          onSubmit={onSubmit}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full md:max-w-[260px]">
            <Input
              value={district}
              onChange={(event) => updateParams({ district: event.target.value })}
              placeholder={UI_TEXT.catalog.capsule.districtPlaceholder}
              className="h-10 rounded-full bg-bg-input/90"
              aria-label={UI_TEXT.catalog.capsule.districtPlaceholder}
            />
          </div>
          <div className="min-w-0 flex-1">
            <FilterChips
              availableToday={effectiveAvailableToday}
              rating45plus={rating45plus}
              hot={hot}
              smartTag={smartTag}
              entityType={entityType}
              priceMin={priceMin}
              priceMax={priceMax}
              onToggleAvailableToday={() => updateParams({ availableToday: availableToday ? null : "true" })}
              onToggleRating45plus={() => updateParams({ ratingMin: rating45plus ? null : "4.5" })}
              onToggleHot={() => updateParams({ hot: hot ? null : "true" })}
              onSmartTagChange={(value) => updateParams({ smartTag: value })}
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
        </div>
      </div>

      {needsService || needsDate ? (
        <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-text-sec">
          {needsService ? UI_TEXT.catalog.timeSearch.selectServiceFirst : UI_TEXT.catalog.timeSearch.selectDateFirst}
        </div>
      ) : null}

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

      {currentLoading && view === "list" ? <CatalogSkeletonGrid /> : null}

      {currentError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          <div>{currentError}</div>
          <button
            type="button"
            onClick={() => void (timeModeActive ? fetchAvailability() : fetchCatalog())}
            className="mt-3 rounded-full border border-red-300 px-4 py-2 text-sm"
          >
            {UI_TEXT.catalog.retry}
          </button>
        </div>
      ) : null}

      {!currentLoading && !currentError && view === "list" && currentItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
          <div className="text-base font-semibold text-foreground">
            {timeModeActive ? UI_TEXT.catalog.timeSearch.emptyTitle : UI_TEXT.catalog.emptyTitle}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {timeModeActive ? UI_TEXT.catalog.timeSearch.emptyDesc : UI_TEXT.catalog.emptyDesc}
          </div>
        </div>
      ) : null}

      {!currentLoading && !currentError && view === "list" && currentItems.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {timeModeActive
            ? availabilityData.items.map((item) => <ProviderResultCard key={item.providerId} item={item} />)
            : data.items.map((item) => <CatalogCard key={item.id} item={item} serviceQuery={serviceQuery} />)}
        </div>
      ) : null}

      {!currentError && view === "map" ? (
        <div className="relative min-h-[60vh] overflow-hidden rounded-2xl border border-border bg-card/60 lg:min-h-[620px]">
          <CatalogMap
            points={mapPoints}
            itemsCount={currentItems.length}
            missingCount={missingMapCount}
            activeId={activeMapId}
            searchEnabled={!timeModeActive}
            loadingResults={currentLoading}
            showEmptySearchNote={
              mapSearchApplied && !currentLoading && currentItems.length === 0 && !currentError && view === "map"
            }
            onSearchArea={(payload, source) => {
              if (timeModeActive) return;
              void applyMapSearch(payload, source);
            }}
            onClusterSelect={handleClusterSelect}
          />
          <CatalogMapSidebar
            open={mapSidebarOpen}
            items={mapSidebarItems}
            onClose={closeMapSidebar}
            onHover={setActiveMapId}
          />
        </div>
      ) : null}

      {!timeModeActive && !loading && !error && data.nextCursor !== null && view === "list" ? (
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
    </div>
  );
}
