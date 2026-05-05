"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import { CatalogSidebar } from "@/features/catalog/components/catalog-sidebar";
import { CategoryPills } from "@/features/catalog/components/category-pills";
import { CatalogPagination } from "@/features/catalog/components/catalog-pagination";
import { SortMenu } from "@/features/catalog/components/sort-menu";
import { MobileFilterDrawer } from "@/features/catalog/components/mobile-filter-drawer";
import { CatalogMap } from "@/features/catalog/components/catalog-map";
import { CatalogMapSidebar } from "@/features/catalog/components/catalog-map-sidebar";
import { CitySelector } from "@/features/cities/components/city-selector";
import { LoginRequiredModal } from "@/features/auth/components/login-required-modal";
import { VisualSearchModal } from "@/features/home/components/visual-search-modal";
import type { CatalogMapPoint } from "@/features/catalog/types";
import { DateTimeFilterBar } from "@/features/search-by-time/components/date-time-filter-bar";
import { ProviderResultCard } from "@/features/search-by-time/components/provider-result-card";
import type { TimePreset } from "@/features/search-by-time/components/time-preset-chips";
import type { CatalogPriceBucket } from "@/lib/catalog/catalog.service";
import type { CatalogSort } from "@/lib/catalog/schemas";
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
  tagline: string | null;
  avatarUrl: string | null;
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
  nextCursor: string | null;
  priceDistribution?: CatalogPriceBucket[];
  totalCount?: number;
  totalPages?: number;
  page?: number;
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

function parseSort(value: string | null): CatalogSort {
  if (
    value === "rating" ||
    value === "price-asc" ||
    value === "price-desc" ||
    value === "distance" ||
    value === "popular"
  ) {
    return value;
  }
  return "relevance";
}

function parsePage(value: string | null): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Russian-style noun pluralization for «мастер / мастера / мастеров». */
function pluralizeMasters(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return UI_TEXT.catalog2.resultsHeader.pluralOne;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return UI_TEXT.catalog2.resultsHeader.pluralFew;
  return UI_TEXT.catalog2.resultsHeader.pluralMany;
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

type CatalogPageClientProps = {
  visualSearchEnabled: boolean;
  /** Whether the visitor has an active session — gates the favorites toggle. */
  isAuthenticated: boolean;
  /** Provider IDs the current user has favorited. Empty for anonymous visitors. */
  favoriteIds: string[];
};

export default function CatalogPageClient({
  visualSearchEnabled,
  isAuthenticated,
  favoriteIds,
}: CatalogPageClientProps) {
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
  const globalCategoryId = searchParams.get("globalCategoryId") ?? "";
  const availableToday = searchParams.get("availableToday") === "true";
  const ratingMin = searchParams.get("ratingMin") ?? "";
  const hot = searchParams.get("hot") === "true";
  const smartTag = parseSmartTag(searchParams.get("smartTag"));
  const entityType = parseEntityType(searchParams.get("entityType"));
  const view = parseViewMode(searchParams.get("view"));
  const sort = parseSort(searchParams.get("sort"));
  const page = parsePage(searchParams.get("page"));
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

  // Active sidebar filter count (excludes time/service/date handled by DateTimeFilterBar)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (globalCategoryId) count++;
    if (district) count++;
    if (ratingMin) count++;
    if (priceMin || priceMax) count++;
    if (hot) count++;
    if (entityType !== "all") count++;
    if (availableToday) count++;
    return count;
  }, [globalCategoryId, district, ratingMin, priceMin, priceMax, hot, entityType, availableToday]);

  const [draftServiceQuery, setDraftServiceQuery] = useState(serviceQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogSearchData>({ items: [], nextCursor: null });
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  // O(1) lookup for `initialFavorited` per card. Memoized from the server-
  // supplied array; the catalog page is fully re-rendered on auth change so
  // we don't try to keep this set in sync after mount.
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  // slug→id map of approved top-level GlobalCategories. Used to translate
  // between the static CategoryPills IDs ("nails", "hair", …) and the live
  // database `globalCategoryId` that the search backend filters on. Falls
  // back to "all" when no pill slug matches the current globalCategoryId.
  const [categorySlugToId, setCategorySlugToId] = useState<Map<string, string>>(new Map());
  const [mapSearch, setMapSearch] = useState<MapSearchState>(null);
  const [mapSearchApplied, setMapSearchApplied] = useState(false);
  const [mapSidebarItems, setMapSidebarItems] = useState<MapSidebarItem[]>([]);
  const [mapSidebarOpen, setMapSidebarOpen] = useState(false);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [visualSearchOpen, setVisualSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const resetFilters = useCallback(() => {
    updateParams({
      globalCategoryId: null,
      district: null,
      ratingMin: null,
      priceMin: null,
      priceMax: null,
      hot: null,
      entityType: null,
      availableToday: null,
    });
  }, [updateParams]);

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

  // One-shot fetch of approved top-level categories so the static
  // CategoryPills slugs can be translated to real `globalCategoryId`s.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/catalog/global-categories?status=APPROVED", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ categories: Array<{ id: string; slug: string; parentId: string | null }> }>
          | null;
        if (!res.ok || !json || !json.ok || cancelled) return;
        const map = new Map<string, string>();
        for (const c of json.data.categories) {
          if (c.parentId === null) map.set(c.slug, c.id);
        }
        setCategorySlugToId(map);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activePillId = useMemo(() => {
    if (!globalCategoryId) return "all" as const;
    for (const [slug, id] of categorySlugToId.entries()) {
      if (id === globalCategoryId && (slug === "nails" || slug === "hair" || slug === "brows" || slug === "skin")) {
        return slug;
      }
    }
    return "all" as const;
  }, [globalCategoryId, categorySlugToId]);

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
    async (overrideMapSearch?: MapSearchState): Promise<CatalogSearchData> => {
      const params = new URLSearchParams();
      const activeMapSearch = overrideMapSearch ?? mapSearch;
      params.set("limit", "20");
      params.set("page", String(page));
      if (sort && sort !== "relevance") params.set("sort", sort);
      if (serviceQuery) params.set("serviceQuery", serviceQuery);
      if (district) params.set("district", district);
      if (date) params.set("date", date);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      if (globalCategoryId) params.set("globalCategoryId", globalCategoryId);
      if (effectiveAvailableToday) params.set("availableToday", "true");
      if (ratingMin) params.set("ratingMin", ratingMin);
      if (hot) params.set("hot", "true");
      if (smartTag) params.set("smartTag", smartTag);
      if (entityType !== "all") params.set("entityType", entityType);
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
      globalCategoryId,
      mapSearch,
      page,
      priceMax,
      priceMin,
      ratingMin,
      serviceQuery,
      smartTag,
      sort,
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
      if (globalCategoryId) params.set("globalCategoryId", globalCategoryId);
      if (effectiveAvailableToday) params.set("availableToday", "true");
      if (ratingMin) params.set("ratingMin", ratingMin);
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
      globalCategoryId,
      priceMax,
      priceMin,
      ratingMin,
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
      try {
        const next = await requestCatalog(nextMapSearch);
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

  // Numbered pagination replaced cursor-based "load more" for default mode.
  // Time-search keeps its own data source and isn't paginated.

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

  // Shared filter props for sidebar and drawer
  const filterProps = {
    globalCategoryId: globalCategoryId || null,
    district,
    ratingMin,
    priceMin,
    priceMax,
    hot,
    entityType,
    availableToday,
    onGlobalCategoryChange: (value: string | null) => updateParams({ globalCategoryId: value }),
    onDistrictChange: (value: string) => updateParams({ district: value || null }),
    onRatingMinChange: (value: string) => updateParams({ ratingMin: value || null }),
    onPriceChange: (min: string, max: string) =>
      updateParams({
        priceMin: min.length > 0 ? min : null,
        priceMax: max.length > 0 ? max : null,
      }),
    onToggleHot: () => updateParams({ hot: hot ? null : "true" }),
    onEntityTypeChange: (value: EntityType) => updateParams({ entityType: value === "all" ? null : value }),
    onToggleAvailableToday: () => updateParams({ availableToday: availableToday ? null : "true" }),
    onReset: resetFilters,
    activeCount: activeFilterCount,
    priceDistribution: data.priceDistribution,
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      {/* Sticky search section — under the global navbar (top-16 ≈ 64 px).
          Wraps DateTimeFilterBar (existing time-search UX), CitySelector,
          category pills and smart-tag pills. The two pill rows carry an
          explicit `groupLabel` so users can tell category filters from
          mood-based ranking. */}
      <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-border-subtle bg-bg-page/95 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mb-3 flex items-center gap-3">
          <CitySelector />
          <div className="flex-1 min-w-0">
            <DateTimeFilterBar
              serviceQuery={draftServiceQuery}
              serviceId={serviceId}
              date={date}
              timePreset={timePreset}
              timeFrom={effectiveTimeFrom}
              timeTo={effectiveTimeTo}
              onServiceQueryChange={onServiceQueryInput}
              onServiceSelect={(service) => {
                setDraftServiceQuery(service.title);
                updateParams({ serviceQuery: service.title, serviceId: service.id });
              }}
              onDateChange={(value) => updateParams({ date: value })}
              onPresetChange={(preset, from, to) =>
                updateParams({ timePreset: preset, timeFrom: from, timeTo: to })
              }
              onCustomTimeChange={(from, to) => updateParams({ timePreset: null, timeFrom: from, timeTo: to })}
              onClearTime={() => updateParams({ timePreset: null, timeFrom: null, timeTo: null })}
              showPhotoSearch={visualSearchEnabled}
              onOpenPhotoSearch={() => {
                if (visualSearchEnabled) setVisualSearchOpen(true);
              }}
              onSubmit={onSubmit}
            />
          </div>
        </div>

        {/* Categories pills — visual segmented row, mapped to a system slug
            on the backend via the existing globalCategoryId. Empty category
            list resolves to `null` (Все). */}
        <CategoryPills
          groupLabel={UI_TEXT.catalog2.searchBar.categoriesGroupLabel}
          value={activePillId}
          onChange={(next) => {
            const id = next === "all" ? null : categorySlugToId.get(next) ?? null;
            updateParams({ globalCategoryId: id, page: null });
          }}
        />

        {/* Smart tags — independent ranking dimension. Disambiguated from
            category filtering via the «По настроению» group label. */}
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-1.5 shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-sec">
            {UI_TEXT.catalog2.searchBar.moodGroupLabel}
          </span>
          <div className="flex flex-wrap gap-2">
            {(["rush", "relax", "design", "safe", "silent"] as const).map((tag) => {
              const active = smartTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    updateParams({ smartTag: active ? null : tag, page: null })
                  }
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                    active
                      ? "border-transparent bg-brand-gradient text-white"
                      : "border-border-subtle bg-bg-card text-text-main hover:bg-bg-input"
                  }`}
                >
                  {UI_TEXT.catalog2.smartTags[tag]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile filter button row */}
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-full"
          aria-label={UI_TEXT.catalog.sidebar.filtersButton}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {UI_TEXT.catalog.sidebar.filtersButton}
          {activeFilterCount > 0 ? (
            <Badge className="ml-0.5 h-5 min-w-5 rounded-full bg-primary px-1.5 text-[11px] text-white">
              {UI_TEXT.catalog.sidebar.activeFiltersCount(activeFilterCount)}
            </Badge>
          ) : null}
        </Button>

        {/* View toggle — mobile */}
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          <Button
            onClick={() => updateParams({ view: "list" })}
            variant={view === "list" ? "primary" : "ghost"}
            size="sm"
            className="rounded-full"
          >
            {UI_TEXT.catalog.viewList}
          </Button>
          <Button
            onClick={() => updateParams({ view: "map" })}
            variant={view === "map" ? "primary" : "ghost"}
            size="sm"
            className="rounded-full"
          >
            {UI_TEXT.catalog.viewMap}
          </Button>
        </div>
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex gap-6">
        {/* Sidebar — desktop only */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 rounded-2xl border border-border bg-card/80 p-5">
            <CatalogSidebar {...filterProps} />
          </div>
        </aside>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {/* Editorial header — eyebrow + display title + sort + view toggle.
              Title pluralization respects Russian noun forms. Total count
              comes from the page-mode response (`totalCount`); for
              time-search and cursor-mode we fall back to the visible item
              count. */}
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1.5 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                {UI_TEXT.catalog2.resultsHeader.eyebrowNoCategory.replace("{city}", "")}
              </p>
              <h1 className="font-display text-3xl leading-[1.1] text-text-main sm:text-4xl lg:text-5xl">
                {(data.totalCount ?? resultCount).toLocaleString("ru-RU")}{" "}
                {pluralizeMasters(data.totalCount ?? resultCount)} рядом
              </h1>
              <p className="mt-1 text-sm text-text-sec">
                {UI_TEXT.catalog2.resultsHeader.subtitleAvailable}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <SortMenu
                value={sort}
                onChange={(next) =>
                  updateParams({
                    sort: next === "relevance" ? null : next,
                    page: null,
                  })
                }
              />
              {/* View toggle — desktop only (mobile lives in the filter row above) */}
              <div className="hidden lg:inline-flex rounded-full border border-border-subtle bg-bg-card p-1">
                <Button
                  onClick={() => updateParams({ view: "list" })}
                  variant={view === "list" ? "primary" : "ghost"}
                  size="sm"
                  className="rounded-full"
                >
                  {UI_TEXT.catalog2.view.grid}
                </Button>
                <Button
                  onClick={() => updateParams({ view: "map" })}
                  variant={view === "map" ? "primary" : "ghost"}
                  size="sm"
                  className="rounded-full"
                >
                  {UI_TEXT.catalog2.view.map}
                </Button>
              </div>
            </div>
          </header>

          {needsService || needsDate ? (
            <div role="status" className="mb-4 rounded-2xl border border-border bg-card/70 p-4 text-sm text-text-sec">
              {needsService ? UI_TEXT.catalog.timeSearch.selectServiceFirst : UI_TEXT.catalog.timeSearch.selectDateFirst}
            </div>
          ) : null}

          {currentLoading && view === "list" ? <CatalogSkeletonGrid /> : null}

          {currentError ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300"
            >
              <div>{currentError}</div>
              <Button
                onClick={() => void (timeModeActive ? fetchAvailability() : fetchCatalog())}
                variant="secondary"
                size="sm"
                className="mt-3"
              >
                {UI_TEXT.catalog.retry}
              </Button>
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
            <motion.div
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            >
              {timeModeActive
                ? availabilityData.items.map((item) => (
                    <motion.div
                      key={item.providerId}
                      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}
                    >
                      <ProviderResultCard item={item} />
                    </motion.div>
                  ))
                : data.items.map((item) => (
                    <motion.div
                      key={item.id}
                      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}
                    >
                      <CatalogCard
                        item={item}
                        serviceQuery={serviceQuery}
                        isAuthenticated={isAuthenticated}
                        initialFavorited={favoriteSet.has(item.id)}
                        onLoginRequired={() => setLoginModalOpen(true)}
                      />
                    </motion.div>
                  ))}
            </motion.div>
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

          {!timeModeActive && !loading && !error && view === "list" && (data.totalPages ?? 1) > 1 ? (
            <div className="pt-8">
              <CatalogPagination
                current={data.page ?? page}
                total={data.totalPages ?? 1}
                onChange={(next) => {
                  updateParams({ page: next > 1 ? String(next) : null });
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <MobileFilterDrawer
        {...filterProps}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onApply={() => setDrawerOpen(false)}
      />

      {visualSearchEnabled ? (
        <VisualSearchModal open={visualSearchOpen} onClose={() => setVisualSearchOpen(false)} />
      ) : null}

      <LoginRequiredModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </div>
  );
}
