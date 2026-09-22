"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Camera, List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBodyScrollLock } from "@/components/ui/use-modal-a11y";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import { CatalogQuickFilters } from "@/features/catalog/components/catalog-quick-filters";
import { CatalogSearchBar } from "@/features/catalog/components/catalog-search-bar";
import {
  ServiceSearchInput,
  type AutocompleteCategory,
} from "@/features/catalog/components/service-search-input";
import { CatalogSidebar } from "@/features/catalog/components/catalog-sidebar";
import { CatalogPagination } from "@/features/catalog/components/catalog-pagination";
import { SortMenu } from "@/features/catalog/components/sort-menu";
import { MobileFilterDrawer } from "@/features/catalog/components/mobile-filter-drawer";
import { LoginRequiredModal } from "@/features/auth/components/login-required-modal";
import type { CatalogMapPoint } from "@/features/catalog/types";
import { ProviderResultCard } from "@/features/search-by-time/components/provider-result-card";
import type { CatalogPriceBucket } from "@/lib/catalog/catalog.service";
import type { CatalogSort } from "@/lib/catalog/schemas";
import type { AvailabilitySearchResponse } from "@/lib/search-by-time/types";
import { getCurrentCitySlug } from "@/lib/cities/client-city";
import { scrollBehavior } from "@/lib/ui/scroll";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";

/**
 * PERF-17 — карта каталога и модалка визуального поиска лежали статическими
 * импортами прямо в чанке страницы `/catalog` (82 kB), хотя каталог
 * открывается в списочном режиме, а визуальный поиск на HEAD вообще погашен
 * флагом `VISUAL_SEARCH_ENABLED` — то есть его код ехал каждому посетителю
 * каталога, не имея ни одного способа быть показанным.
 *
 * `ssr: false` ничего не меняет по смыслу: карта работает с DOM-контейнером
 * и грузит Яндекс-скрипт из эффекта, модалка рендерится только по клику;
 * серверной разметки у обеих не было.
 *
 * Скелет карты накрывает контейнер целиком (он `relative`), поэтому
 * переключение в режим карты не прыгает.
 */
const CatalogMap = dynamic(
  () => import("@/features/catalog/components/catalog-map").then((m) => m.CatalogMap),
  { ssr: false, loading: () => <Skeleton className="absolute inset-0 h-full w-full rounded-none" /> },
);

const CatalogMapCarousel = dynamic(
  () => import("@/features/catalog/components/catalog-map-carousel").then((m) => m.CatalogMapCarousel),
  { ssr: false, loading: () => null },
);

const VisualSearchModal = dynamic(
  () => import("@/features/home/components/visual-search-modal").then((m) => m.VisualSearchModal),
  { ssr: false, loading: () => null },
);

type EntityType = "all" | "master" | "studio";
type ViewMode = "list" | "map";
type TimePresetValue = "morning" | "day" | "evening";

type CatalogSearchItem = {
  type: "master" | "studio";
  // QA-103: public search no longer returns the internal CUID — key off
  // publicUsername (profile link, favorites, React key).
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

/** Кто выбрал мастера на карте: от этого зависит, кто за кем «едет». */
type MapSelection = { id: string; source: "map" | "carousel" };

const DEBOUNCE_MS = 400;
const TIME_SEARCH_DEBOUNCE_MS = 200;
/** Раскладка без сайдбара (< `lg`): карта здесь — полноэкранный слой. */
const MOBILE_LAYOUT_QUERY = "(max-width: 1023px)";

const TIME_PRESET_RANGES: Record<TimePresetValue, { from: string; to: string }> = {
  morning: { from: "09:00", to: "12:00" },
  day: { from: "12:00", to: "18:00" },
  evening: { from: "18:00", to: "22:00" },
};

const TH = UI_TEXT.catalog2.resultsHeader;

function parseEntityType(value: string | null): EntityType {
  if (value === "master" || value === "studio") return value;
  return "all";
}

function parseViewMode(value: string | null): ViewMode {
  return value === "map" ? "map" : "list";
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
  if (mod10 === 1 && mod100 !== 11) return TH.pluralOne;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return TH.pluralFew;
  return TH.pluralMany;
}

function resultsTitle(count: number): string {
  return TH.titleTemplate
    .replace("{count}", count.toLocaleString("ru-RU"))
    .replace("{plural}", pluralizeMasters(count));
}

function toMapPoint(
  item: CatalogSearchItem | AvailabilitySearchData["items"][number]
): CatalogMapPoint | null {
  // Availability (search-by-time) items are discriminated by `slots`; the
  // catalog item has `nextSlot` (singular), not `slots`.
  if ("slots" in item) {
    if (typeof item.geoLat !== "number" || typeof item.geoLng !== "number") return null;
    return {
      // QA/rule-12: map point key is the public username, never the CUID.
      id: item.publicUsername ?? "",
      title: item.name,
      type: item.providerType === "STUDIO" ? "studio" : "master",
      avatarUrl: item.avatarUrl,
      photoUrl: item.photos[0] ?? null,
      subtitle: item.service.title,
      ratingAvg: item.ratingAvg,
      reviewsCount: item.reviewsCount,
      priceFrom: item.priceFrom,
      publicUsername: item.publicUsername ?? null,
      geoLat: item.geoLat,
      geoLng: item.geoLng,
    };
  }

  if (typeof item.geoLat !== "number" || typeof item.geoLng !== "number") return null;
  return {
    // QA-103: map point key is the public username, never the CUID.
    id: item.publicUsername ?? "",
    title: item.title,
    type: item.type,
    avatarUrl: item.avatarUrl,
    photoUrl: item.photos[0] ?? null,
    subtitle: item.tagline ?? item.primaryService?.title ?? null,
    ratingAvg: item.ratingAvg,
    reviewsCount: item.reviewsCount,
    priceFrom: item.minPrice,
    publicUsername: item.publicUsername ?? null,
    geoLat: item.geoLat,
    geoLng: item.geoLng,
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
  /** publicUsernames the current user has favorited. Empty for anonymous visitors. */
  favoriteUsernames: string[];
};

export default function CatalogPageClient({
  visualSearchEnabled,
  isAuthenticated,
  favoriteUsernames,
}: CatalogPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduce = useReducedMotion();

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
  const entityType = parseEntityType(searchParams.get("entityType"));
  const view = parseViewMode(searchParams.get("view"));
  const sort = parseSort(searchParams.get("sort"));
  const page = parsePage(searchParams.get("page"));
  const todayIso = new Date().toISOString().slice(0, 10);
  // `date=<сегодня>` — прежняя форма фильтра «сегодня» (ссылки со снятого
  // блока «Когда»); читается как «Свободно сегодня».
  const isTodaySelected = date === todayIso;
  const effectiveAvailableToday = availableToday || isTodaySelected;
  // Поиск по окошкам во времени остаётся доступным по прямой ссылке с
  // `serviceId` + датой + диапазоном. Неполный набор параметров просто не
  // включает этот режим — раньше он показывал «Сначала выберите услугу», а
  // выбрать услугу на странице было негде.
  const presetRange = timePresetRaw ? TIME_PRESET_RANGES[timePresetRaw] : null;
  const effectiveTimeFrom = timeFrom || presetRange?.from || "";
  const effectiveTimeTo = timeTo || presetRange?.to || "";
  const timeModeActive = Boolean(effectiveTimeFrom && effectiveTimeTo && serviceId && date);

  // Счётчик на кнопке «Фильтры»: всё, что выставляется в панели фильтров.
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (globalCategoryId) count++;
    if (district) count++;
    if (ratingMin) count++;
    if (priceMin || priceMax) count++;
    if (hot) count++;
    if (entityType !== "all") count++;
    if (effectiveAvailableToday) count++;
    return count;
  }, [globalCategoryId, district, ratingMin, priceMin, priceMax, hot, entityType, effectiveAvailableToday]);

  const [draftServiceQuery, setDraftServiceQuery] = useState(serviceQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogSearchData>({ items: [], nextCursor: null });
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  // O(1) lookup for `initialFavorited` per card. Memoized from the server-
  // supplied array; the catalog page is fully re-rendered on auth change so
  // we don't try to keep this set in sync after mount.
  const favoriteSet = useMemo(() => new Set(favoriteUsernames), [favoriteUsernames]);
  const [mapSearch, setMapSearch] = useState<MapSearchState>(null);
  const [mapSelection, setMapSelection] = useState<MapSelection | null>(null);
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

  /**
   * Любое изменение фильтра возвращает на первую страницу: оставаться на
   * третьей странице ПРЕЖНЕЙ выдачи значило показать пустоту при сузившемся
   * наборе.
   *
   * CATALOG-COMPACT-SEARCH — фильтр больше НЕ стирает введённый запрос
   * (прежнее правило 22a-fix-3 «поиск и фильтры — разные режимы»). На
   * телефоне поле и чипы стоят вплотную, и «маникюр» + «Свободно сегодня»
   * — естественная пара, как в любом приложении записи; стирание запроса
   * тапом по соседнему чипу выглядело как поломка. Запрос и фильтры и раньше
   * уходили в один запрос к API, так что выдача считает их вместе.
   */
  const applyFilters = useCallback(
    (updates: Record<string, string | null>) => {
      updateParams({ ...updates, page: null });
    },
    [updateParams],
  );

  const resetFilters = useCallback(() => {
    applyFilters({
      globalCategoryId: null,
      district: null,
      ratingMin: null,
      priceMin: null,
      priceMax: null,
      hot: null,
      entityType: null,
      availableToday: null,
      date: null,
    });
  }, [applyFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftServiceQuery !== serviceQuery) {
        updateParams({ serviceQuery: draftServiceQuery, page: null });
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draftServiceQuery, serviceQuery, updateParams]);

  useEffect(() => {
    setDraftServiceQuery(serviceQuery);
  }, [serviceQuery]);

  const onSubmit = useCallback(() => {
    updateParams({ serviceQuery: draftServiceQuery, page: null });
  }, [draftServiceQuery, updateParams]);

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
    ]
  );

  const applyMapSearch = useCallback(
    async (nextMapSearch: MapSearchState) => {
      skipCatalogFetchRef.current = true;
      setMapSearch(nextMapSearch);
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

  // В режиме поиска по окошкам `data` — это прежняя выдача каталога, и её
  // `totalCount` к показанным карточкам отношения не имеет.
  const resultCount = timeModeActive ? currentItems.length : (data.totalCount ?? currentItems.length);
  const countPending = currentLoading && currentItems.length === 0;

  const mapPoints = useMemo(
    () =>
      currentItems
        .map((item) => toMapPoint(item))
        .filter((item): item is CatalogMapPoint => Boolean(item)),
    [currentItems]
  );
  const missingMapCount = currentItems.length - mapPoints.length;

  // Выбор, указывающий на мастера, которого в новой выдаче нет, — не выбор.
  const selectedMapId =
    mapSelection && mapPoints.some((point) => point.id === mapSelection.id) ? mapSelection.id : null;
  const selectFromMap = useCallback((id: string) => setMapSelection({ id, source: "map" }), []);
  const selectFromCarousel = useCallback((id: string) => setMapSelection({ id, source: "carousel" }), []);

  const setView = useCallback(
    (next: ViewMode) => {
      setMapSelection(null);
      updateParams({ view: next === "map" ? "map" : null });
    },
    [updateParams],
  );

  // Режим карты на телефоне — полноэкранный слой. Страница под ним не должна
  // прокручиваться: жест по шапке слоя уезжал бы в неё, и вместе с ней —
  // фиксированные панели iOS Safari.
  useBodyScrollLock(view === "map", MOBILE_LAYOUT_QUERY);

  // Shared filter props for sidebar and drawer
  const filterProps = {
    globalCategoryId: globalCategoryId || null,
    district,
    ratingMin,
    priceMin,
    priceMax,
    hot,
    entityType,
    availableToday: effectiveAvailableToday,
    onGlobalCategoryChange: (value: string | null) => {
      applyFilters({ globalCategoryId: value });
    },
    onDistrictChange: (value: string) => {
      applyFilters({ district: value || null });
    },
    onRatingMinChange: (value: string) => {
      applyFilters({ ratingMin: value || null });
    },
    onPriceChange: (min: string, max: string) => {
      applyFilters({
        priceMin: min.length > 0 ? min : null,
        priceMax: max.length > 0 ? max : null,
      });
    },
    onToggleHot: () => {
      applyFilters({ hot: hot ? null : "true" });
    },
    onEntityTypeChange: (value: EntityType) => {
      applyFilters({ entityType: value === "all" ? null : value });
    },
    onToggleAvailableToday: () => {
      applyFilters(
        effectiveAvailableToday ? { availableToday: null, date: null } : { availableToday: "true" },
      );
    },
    onReset: resetFilters,
    activeCount: activeFilterCount,
    priceDistribution: data.priceDistribution,
  };

  // Selecting a category from the autocomplete dropdown — clear input AND
  // apply the filter: the typed text was a way to FIND the category.
  const handleCategorySelectFromSearch = useCallback(
    (category: AutocompleteCategory) => {
      setDraftServiceQuery("");
      updateParams({
        serviceQuery: null,
        serviceId: null,
        globalCategoryId: category.id,
        page: null,
      });
    },
    [updateParams],
  );

  // City slug for autocomplete scoping — pulled from the same client-city
  // store the navbar <CitySelector> writes to. Hydrates after mount, so
  // the first auto-complete request after a hard nav may not include city
  // — acceptable trade-off (results just aren't pre-narrowed).
  const [citySlug, setCitySlug] = useState<string | null>(null);
  useEffect(() => {
    setCitySlug(getCurrentCitySlug());
  }, []);

  /**
   * CATALOG-COMPACT-SEARCH — шапка каталога на телефоне: строка поиска с
   * кнопкой фильтров и одна полоса быстрых фильтров, ≈100 px вместо прежних
   * ≈450 (карточка поиска с кнопкой «Найти», два ряда чипов «Когда», строка
   * «Фильтры / Список / На карте», редакционный заголовок и сортировка во всю
   * ширину). Устройство — как у приложений записи и маркетплейсов: поиск
   * применяется сам по мере ввода (кнопка «Найти» — клавиша клавиатуры),
   * частые фильтры — в один тап, остальное — в панели, переключатель карты —
   * плавающая кнопка у нижней кромки. Один и тот же узел стоит либо в
   * липкой шапке списка, либо сверху полноэкранной карты — поиск и фильтры
   * доступны в обоих режимах.
   */
  const mobileHeader = (
    <div className="space-y-2 py-2">
      <div className="flex items-center gap-2">
        <ServiceSearchInput
          appearance="field"
          value={draftServiceQuery}
          onChange={onServiceQueryInput}
          onCategorySelect={handleCategorySelectFromSearch}
          onSubmit={onSubmit}
          citySlug={citySlug}
          className="min-w-0 flex-1"
          trailingAction={
            visualSearchEnabled ? (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-text-sec hover:text-text-main"
                aria-label={UI_TEXT.home.visualSearch.button}
                onClick={() => setVisualSearchOpen(true)}
              >
                <Camera className="h-4 w-4" aria-hidden />
              </Button>
            ) : undefined
          }
        />
        <div className="relative shrink-0">
          <Button
            variant="secondary"
            size="none"
            onClick={() => setDrawerOpen(true)}
            className="h-11 w-11 rounded-full p-0"
            aria-label={UI_TEXT.catalog2.searchBar.filtersAria(activeFilterCount)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </Button>
          {activeFilterCount > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-white ring-2 ring-bg-page"
            >
              {activeFilterCount}
            </span>
          ) : null}
        </div>
      </div>
      <CatalogQuickFilters
        availableToday={effectiveAvailableToday}
        hot={hot}
        ratingMin={ratingMin}
        entityType={entityType}
        globalCategoryId={globalCategoryId || null}
        priceMin={priceMin}
        priceMax={priceMax}
        district={district}
        onChange={applyFilters}
      />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8 lg:pb-8 lg:pt-4">
      {/* Десктоп: одна строка поиска в карточке, липкая под шапкой сайта. */}
      <div className="sticky top-[var(--topbar-h)] z-20 -mx-4 mb-6 hidden bg-bg-page/80 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:block lg:px-8">
        <CatalogSearchBar
          serviceQuery={draftServiceQuery}
          citySlug={citySlug}
          onServiceQueryChange={onServiceQueryInput}
          onCategorySelectFromSearch={handleCategorySelectFromSearch}
          onSubmit={onSubmit}
          showPhotoSearch={visualSearchEnabled}
          onOpenPhotoSearch={() => {
            if (visualSearchEnabled) setVisualSearchOpen(true);
          }}
        />
      </div>

      {/* Телефон, режим списка: компактная липкая шапка. В режиме карты тот же
          узел переезжает наверх полноэкранного слоя. */}
      {view === "list" ? (
        <div className="sticky top-[var(--topbar-h)] z-20 -mx-4 mb-3 border-b border-border-subtle/60 bg-bg-page/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
          {mobileHeader}
        </div>
      ) : null}

      {/* Main layout: sidebar + content */}
      <div className="flex gap-6">
        {/* Sidebar — desktop only */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-[calc(var(--topbar-h)+6.5rem)] rounded-2xl border border-border bg-card/80 p-5">
            <CatalogSidebar {...filterProps} />
          </div>
        </aside>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {/* Заголовок выдачи. На телефоне — одна строка «N мастеров рядом» +
              сортировка; редакционная подводка и крупный кегль — с `lg`. */}
          <header className="mb-3 flex items-center justify-between gap-3 lg:mb-6 lg:items-end">
            <div className="min-w-0">
              <p className="mb-1.5 hidden font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent-text lg:block">
                {TH.eyebrow}
              </p>
              {countPending ? (
                <Skeleton className="h-7 w-44 lg:h-12 lg:w-72" />
              ) : (
                <h1 className="truncate font-display text-xl leading-tight text-text-main sm:text-2xl lg:text-5xl lg:leading-[1.1]">
                  {resultsTitle(resultCount)}
                </h1>
              )}
              <p className="mt-1 hidden text-sm text-text-sec lg:block">{TH.subtitleAvailable}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="lg:hidden">
                <SortMenu
                  compact
                  value={sort}
                  onChange={(next) => updateParams({ sort: next === "relevance" ? null : next, page: null })}
                />
              </div>
              <div className="hidden lg:block">
                <SortMenu
                  value={sort}
                  onChange={(next) => updateParams({ sort: next === "relevance" ? null : next, page: null })}
                />
              </div>
              <div className="hidden rounded-full border border-border-subtle bg-bg-card p-1 lg:inline-flex">
                <Button
                  onClick={() => setView("list")}
                  variant={view === "list" ? "primary" : "ghost"}
                  size="sm"
                  className="rounded-full"
                >
                  {UI_TEXT.catalog2.view.grid}
                </Button>
                <Button
                  onClick={() => setView("map")}
                  variant={view === "map" ? "primary" : "ghost"}
                  size="sm"
                  className="rounded-full"
                >
                  {UI_TEXT.catalog2.view.map}
                </Button>
              </div>
            </div>
          </header>

          {currentLoading && view === "list" ? <CatalogSkeletonGrid /> : null}

          {currentError ? (
            <div
              role="alert"
              className="rounded-2xl border border-danger-border bg-danger-surface p-6 text-center text-sm text-danger-text"
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
              {/* EXP-030: empty results shouldn't dead-end — offer a reset when
                  filters are active (e.g. the never-computed "Свободно сегодня"
                  snapshot always yields 0). */}
              {!timeModeActive && activeFilterCount > 0 ? (
                <Button onClick={resetFilters} variant="secondary" size="sm" className="mt-4">
                  {UI_TEXT.catalog.sidebar.reset}
                </Button>
              ) : null}
            </div>
          ) : null}

          {!currentLoading && !currentError && view === "list" && currentItems.length > 0 ? (
            <motion.div
              data-testid="catalog-list"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={reduce ? undefined : { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            >
              {timeModeActive
                ? availabilityData.items.map((item, index) => (
                    <motion.div
                      key={item.publicUsername ?? index}
                      variants={reduce ? undefined : { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}
                    >
                      <ProviderResultCard item={item} />
                    </motion.div>
                  ))
                : data.items.map((item, index) => (
                    <motion.div
                      key={item.publicUsername ?? index}
                      variants={reduce ? undefined : { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}
                    >
                      <CatalogCard
                        item={item}
                        serviceQuery={serviceQuery}
                        isAuthenticated={isAuthenticated}
                        initialFavorited={item.publicUsername ? favoriteSet.has(item.publicUsername) : false}
                        onLoginRequired={() => setLoginModalOpen(true)}
                      />
                    </motion.div>
                  ))}
            </motion.div>
          ) : null}

          {/* Режим карты. На телефоне — слой на весь экран между шапкой сайта и
              нижней навигацией (PWA-FIX-11): сверху поиск и быстрые фильтры,
              ниже карта, под ней — полоса карточек, связанная с метками. Нижняя
              граница — фактическая высота нижней навигации (`--bottom-nav-h`
              публикует `BottomNav`); прежняя константа `4rem + инсет`
              промахивалась, и в щель просвечивала страница. С `lg` — карточка в
              потоке рядом с сайдбаром. */}
          {!currentError && view === "map" ? (
            <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h,4rem)] top-[var(--topbar-h)] z-30 flex flex-col overflow-hidden bg-bg-page lg:static lg:bottom-auto lg:top-auto lg:z-auto lg:h-[680px] lg:rounded-2xl lg:border lg:border-border-subtle">
              <div className="relative z-20 shrink-0 border-b border-border-subtle/60 bg-bg-page px-4 sm:px-6 lg:hidden">
                {mobileHeader}
              </div>
              <div className="relative min-h-0 flex-1">
                <CatalogMap
                  points={mapPoints}
                  selectedId={selectedMapId}
                  followSelection={mapSelection?.source === "carousel"}
                  onSelect={selectFromMap}
                  searchEnabled={!timeModeActive}
                  loadingResults={currentLoading}
                  autoFit={mapSearch === null}
                  onSearchArea={(payload) => {
                    if (timeModeActive) return;
                    void applyMapSearch(payload);
                  }}
                  centerAction={
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => setView("list")}
                      className="rounded-full px-5 lg:hidden"
                    >
                      <List className="h-4 w-4" aria-hidden />
                      {UI_TEXT.catalog2.view.list}
                    </Button>
                  }
                />
              </div>
              <div className="shrink-0 border-t border-border-subtle/60 bg-bg-page">
                <CatalogMapCarousel
                  points={mapPoints}
                  selectedId={selectedMapId}
                  followSelection={mapSelection?.source === "map"}
                  onSelect={selectFromCarousel}
                  loading={currentLoading}
                  missingCount={missingMapCount}
                  onShowList={() => setView("list")}
                />
              </div>
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
                    window.scrollTo({ top: 0, behavior: scrollBehavior() });
                  }
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Телефон, режим списка: переключатель на карту — плавающая кнопка над
          нижней навигацией, как у приложений с картой в выдаче. */}
      {view === "list" ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h,4rem)+1rem)] z-30 flex justify-center lg:hidden">
          <Button
            variant="primary"
            size="md"
            onClick={() => setView("map")}
            className="pointer-events-auto rounded-full px-5"
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            {UI_TEXT.catalog2.view.map}
          </Button>
        </div>
      ) : null}

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
