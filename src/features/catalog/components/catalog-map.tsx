"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Loader2, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogMapPoint } from "@/features/catalog/types";
import * as UI_TEXT from "@/lib/ui/text";
import { clientEnv } from "@/lib/env.client";

type MapSearchPayload = {
  bbox: string;
  center: { lat: number; lng: number };
};

type CatalogMapProps = {
  points: CatalogMapPoint[];
  selectedId: string | null;
  /**
   * Вести карту к выбранной метке. Истинно, когда выбор родила полоса карточек
   * (свайп); когда выбор пришёл тапом по самой метке, она и так на экране.
   */
  followSelection: boolean;
  onSelect: (id: string) => void;
  searchEnabled: boolean;
  loadingResults: boolean;
  /**
   * Подгонять видимую область под найденных при смене выдачи. Ложно, когда
   * выдача сама получена поиском по области: иначе карта «отпрыгивала» от
   * места, которое пользователь только что выбрал.
   */
  autoFit: boolean;
  onSearchArea: (payload: MapSearchPayload, source: "manual" | "auto") => void;
  /** Действие по центру у нижней кромки карты (на телефоне — «Список»). */
  centerAction?: ReactNode;
};

type YTemplateLayout = Record<string, unknown>;

type YMapEvent = {
  get: (key: string) => unknown;
};

type YOptions = {
  set: (key: string, value: unknown) => void;
  unset: (key: string) => void;
};

type YPlacemark = {
  properties: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
  options: YOptions;
  events: {
    add: (name: string, cb: () => void) => void;
  };
};

type YCluster = {
  getGeoObjects: () => YPlacemark[];
};

type YClusterer = {
  add: (items: YPlacemark[]) => void;
  removeAll: () => void;
  getObjectState: (item: YPlacemark) => { isClustered?: boolean } | null;
  events: {
    add: (name: string, cb: (event: YMapEvent) => void) => void;
  };
};

type YMapInstance = {
  geoObjects: {
    add: (obj: unknown) => void;
    remove: (obj: unknown) => void;
    removeAll: () => void;
  };
  controls: {
    add: (control: string, options?: Record<string, unknown>) => void;
  };
  events: {
    add: (name: string, cb: () => void) => void;
  };
  setBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
  setCenter: (center: [number, number], zoom?: number, options?: Record<string, unknown>) => void;
  panTo: (center: [number, number], options?: Record<string, unknown>) => void;
  getBounds: () => [[number, number], [number, number]] | null;
  getCenter: () => [number, number];
  getZoom: () => number;
  options: {
    set: (key: string, value: unknown) => void;
  };
  destroy: () => void;
};

type YMapsApi = {
  ready: (cb: () => void) => void;
  Map: new (
    container: HTMLElement,
    state: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => YMapInstance;
  Placemark: new (
    coords: [number, number],
    properties: Record<string, unknown>,
    options: Record<string, unknown>
  ) => YPlacemark;
  Clusterer: new (options?: Record<string, unknown>) => YClusterer;
  templateLayoutFactory: { createClass: (template: string) => YTemplateLayout };
};

type YMapsWindow = Window & { ymaps?: YMapsApi };

/**
 * Москва. Раньше здесь стоял центр Алматы — остаток до RF-ONLY-SCOPE-01:
 * карта без результатов открывалась над Казахстаном.
 */
const DEFAULT_CENTER = { lat: 55.751244, lng: 37.618423 };
const DEFAULT_ZOOM = 11;
/** Масштаб «я здесь»: видно несколько кварталов вокруг. */
const MAP_ZOOM_ON_GEO = 14;
/** Масштаб, на котором одиночный результат или метка из кластера читается. */
const MAP_ZOOM_ON_POINT = 15;
/** Дальше этого масштаба кластер уже не раздвинуть — показываем карточку. */
const CLUSTER_EXPAND_MAX_ZOOM = 17;
/** Меньше этого разброса (градусы, ≈50 м) метки стоят в одном здании. */
const SAME_PLACE_SPAN_DEG = 0.0005;
/**
 * Окно, в течение которого `actionend` считается следствием нашего же
 * программного сдвига (подгонка, переход к метке). Прежний счётчик «пропустить
 * два события» промахивался: анимация даёт одно событие, и второе «пропущенное»
 * съедало первый настоящий жест — кнопка «Искать в этой области» не появлялась.
 */
const PROGRAMMATIC_MOVE_WINDOW_MS = 900;
const GEO_NOTICE_MS = 5000;
const YMAPS_SCRIPT_ID = "bh-ymaps-script";

const darkMapCustomization = [
  { tags: { all: "water" }, stylers: { color: "#1b2330" } },
  { tags: { all: "landscape" }, stylers: { color: "#12151c" } },
  { tags: { all: "road" }, stylers: { color: "#2a2f3a" } },
  { tags: { all: "road_major" }, stylers: { color: "#343b49" } },
  { tags: { all: "road_minor" }, stylers: { color: "#242a35" } },
  { tags: { all: "poi" }, stylers: { color: "#202532" } },
  { tags: { all: "park" }, stylers: { color: "#1d2a24" } },
  { tags: { all: "transit" }, stylers: { color: "#232734" } },
  { tags: { all: "admin" }, stylers: { visibility: "off" } },
];

const lightMapCustomization = null;

let ymapsLoader: Promise<YMapsApi> | null = null;
let cachedGeoCoords: { lat: number; lng: number } | null = null;

function svgDataUri(svg: string): string {
  // `encodeURIComponent` deliberately leaves `(` and `)` unescaped, but these
  // URIs are interpolated into an UNQUOTED CSS `url(...)` in the marker
  // template below. The fallback SVGs reference their gradient via
  // `fill="url(#g)"`, so a literal `)` closed the CSS `url()` early → the whole
  // declaration was rejected → `background-image: none` (markers painted as
  // empty circles). Percent-encode the parens so the value is url()-safe.
  const encoded = encodeURIComponent(svg)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  return `data:image/svg+xml;utf8,${encoded}`;
}

const FALLBACK_MASTER_AVATAR = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e2c18d"/>
        <stop offset="1" stop-color="#b98b4d"/>
      </linearGradient>
    </defs>
    <rect width="80" height="80" rx="40" fill="url(#g)"/>
  </svg>`
);

const FALLBACK_STUDIO_AVATAR = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f5f5f5"/>
        <stop offset="1" stop-color="#cbd0d6"/>
      </linearGradient>
    </defs>
    <rect width="80" height="80" rx="18" fill="url(#g)"/>
  </svg>`
);

function getYmapsUrl(): string {
  const apiKey = clientEnv.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  const keyQuery = apiKey ? `&apikey=${apiKey}` : "";
  return `https://api-maps.yandex.ru/2.1/?lang=ru_RU${keyQuery}`;
}

function loadYmaps(): Promise<YMapsApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error(UI_TEXT.catalog.loadFailed));
  }
  const ymapsWindow = window as YMapsWindow;
  if (ymapsWindow.ymaps) {
    return new Promise((resolve) => ymapsWindow.ymaps?.ready(() => resolve(ymapsWindow.ymaps!)));
  }
  if (ymapsLoader) return ymapsLoader;

  ymapsLoader = new Promise((resolve, reject) => {
    const existing = document.getElementById(YMAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        const loadedWindow = window as YMapsWindow;
        loadedWindow.ymaps?.ready(() => resolve(loadedWindow.ymaps!));
      });
      existing.addEventListener("error", () => {
        ymapsLoader = null;
        reject(new Error(UI_TEXT.catalog.loadFailed));
      });
      return;
    }

    const script = document.createElement("script");
    script.id = YMAPS_SCRIPT_ID;
    script.src = getYmapsUrl();
    script.async = true;
    script.onload = () => {
      const loadedWindow = window as YMapsWindow;
      if (!loadedWindow.ymaps) {
        ymapsLoader = null;
        reject(new Error(UI_TEXT.catalog.loadFailed));
        return;
      }
      loadedWindow.ymaps.ready(() => resolve(loadedWindow.ymaps!));
    };
    script.onerror = () => {
      ymapsLoader = null;
      reject(new Error(UI_TEXT.catalog.loadFailed));
    };
    document.head.appendChild(script);
  });

  return ymapsLoader;
}

function buildHintText(title: string, ratingAvg: number): string {
  if (Number.isFinite(ratingAvg) && ratingAvg > 0) {
    return UI_TEXT.catalog.map.ratingHint(title, ratingAvg);
  }
  return title;
}

function isCluster(value: unknown): value is YCluster {
  return Boolean(value && typeof value === "object" && "getGeoObjects" in value);
}

function isCatalogMapPoint(value: unknown): value is CatalogMapPoint {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const type = record.type;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    (type === "master" || type === "studio") &&
    typeof record.geoLat === "number" &&
    typeof record.geoLng === "number"
  );
}

function boundsOf(points: ReadonlyArray<{ geoLat: number; geoLng: number }>): [[number, number], [number, number]] {
  const lats = points.map((p) => p.geoLat);
  const lngs = points.map((p) => p.geoLng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/** Мышь с точным указателем — кнопки масштаба нужны; на тач-экране есть щипок. */
function hasFinePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

export function CatalogMap({
  points,
  selectedId,
  followSelection,
  onSelect,
  searchEnabled,
  loadingResults,
  autoFit,
  onSearchArea,
  centerAction,
}: CatalogMapProps) {
  const { resolvedTheme } = useTheme();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  const clustererRef = useRef<YClusterer | null>(null);
  const placemarksRef = useRef(new Map<string, { placemark: YPlacemark; baseClass: string; point: CatalogMapPoint }>());
  const userPlacemarkRef = useRef<YPlacemark | null>(null);
  const layoutRef = useRef<{
    marker: YTemplateLayout;
    hint: YTemplateLayout;
    cluster: YTemplateLayout;
    user: YTemplateLayout;
  } | null>(null);

  const programmaticUntilRef = useRef(0);
  const mountedRef = useRef(false);
  const geoNoticeTimerRef = useRef<number | null>(null);

  // IMPORTANT: keep latest callbacks without reinitializing the map
  const onSelectRef = useRef(onSelect);
  const onSearchAreaRef = useRef(onSearchArea);
  const searchEnabledRef = useRef(searchEnabled);
  // Читается в момент смены выдачи; сам по себе перерисовку меток не вызывает.
  const autoFitRef = useRef(autoFit);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onSearchAreaRef.current = onSearchArea;
    searchEnabledRef.current = searchEnabled;
    autoFitRef.current = autoFit;
  }, [autoFit, onSearchArea, onSelect, searchEnabled]);

  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapError, setMapError] = useState<string | null>(null);
  const [dirtyArea, setDirtyArea] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(cachedGeoCoords);

  /** Помечает ближайший `actionend` как следствие нашего сдвига, а не жеста. */
  const markProgrammaticMove = useCallback(() => {
    programmaticUntilRef.current = performance.now() + PROGRAMMATIC_MOVE_WINDOW_MS;
  }, []);

  const buildSearchPayload = useCallback((): MapSearchPayload | null => {
    const map = mapRef.current;
    if (!map) return null;
    const bounds = map.getBounds();
    if (!bounds || bounds.length !== 2) return null;
    const [[lat1, lng1], [lat2, lng2]] = bounds;
    const minLat = Math.min(lat1, lat2);
    const maxLat = Math.max(lat1, lat2);
    const minLng = Math.min(lng1, lng2);
    const maxLng = Math.max(lng1, lng2);
    const center = map.getCenter();
    return {
      bbox: `${minLat},${minLng},${maxLat},${maxLng}`,
      center: { lat: center[0], lng: center[1] },
    };
  }, []);

  const handleSearchArea = useCallback(() => {
    const payload = buildSearchPayload();
    if (!payload) return;
    setDirtyArea(false);
    onSearchAreaRef.current(payload, "manual");
  }, [buildSearchPayload]);

  const showGeoNotice = useCallback((text: string) => {
    setGeoNotice(text);
    if (geoNoticeTimerRef.current !== null) window.clearTimeout(geoNoticeTimerRef.current);
    geoNoticeTimerRef.current = window.setTimeout(() => setGeoNotice(null), GEO_NOTICE_MS);
  }, []);

  /**
   * «Показать, где я»: центр на пользователе и сразу поиск в этой области —
   * пользователь, нажавший кнопку, хочет видеть мастеров рядом, а не ещё одну
   * кнопку «Искать здесь». Разрешение спрашивается ТОЛЬКО по этому нажатию:
   * прежний запрос при открытии карты выбрасывал системный диалог раньше, чем
   * человек успевал увидеть карту, и вдобавок уводил её от результатов к
   * пользователю — в другом городе карта открывалась пустой.
   */
  const locateUser = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showGeoNotice(UI_TEXT.catalog.map.geoError);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cachedGeoCoords = coords;
        setLocating(false);
        setUserCoords(coords);

        const map = mapRef.current;
        if (!map) return;
        markProgrammaticMove();
        map.setCenter([coords.lat, coords.lng], MAP_ZOOM_ON_GEO);
        if (searchEnabledRef.current) {
          const payload = buildSearchPayload();
          if (payload) {
            setDirtyArea(false);
            onSearchAreaRef.current(payload, "manual");
          }
        }
      },
      (err) => {
        if (!mountedRef.current) return;
        setLocating(false);
        showGeoNotice(
          err.code === err.PERMISSION_DENIED
            ? UI_TEXT.catalog.map.geoAccessDenied
            : UI_TEXT.catalog.map.geoError,
        );
      },
      { timeout: 7000, enableHighAccuracy: true, maximumAge: 60_000 }
    );
  }, [buildSearchPayload, markProgrammaticMove, showGeoNotice]);

  const destroyMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove cluster items first to avoid internal layout updates after destroy
    try {
      clustererRef.current?.removeAll();
    } catch {
      // no-op
    }

    try {
      map.geoObjects.removeAll();
    } catch {
      // no-op
    }

    try {
      map.destroy();
    } catch {
      // no-op
    }

    mapRef.current = null;
    clustererRef.current = null;
    placemarksRef.current.clear();
    userPlacemarkRef.current = null;
    layoutRef.current = null;
    programmaticUntilRef.current = 0;
  }, []);

  const initMap = useCallback(async () => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return; // already initialized

    setMapStatus("loading");
    setMapError(null);

    try {
      const ymaps = await loadYmaps();
      if (!mountedRef.current) return;
      if (!mapContainerRef.current) return;
      if (mapRef.current) return;

      // Штатный вертикальный ползунок масштаба занимал на телефоне треть
      // высоты карты и дублировал щипок. Кнопки масштаба остаются только там,
      // где щипка нет, — у мыши, и в компактной форме.
      const map = new ymaps.Map(
        mapContainerRef.current,
        {
          center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
          zoom: DEFAULT_ZOOM,
          controls: [],
        },
        { suppressMapOpenBlock: true }
      );
      if (hasFinePointer()) {
        map.controls.add("zoomControl", { size: "small", position: { right: 12, top: 12 } });
      }

      const markerLayout = ymaps.templateLayoutFactory.createClass(
        '<div class="map-marker $[properties.typeClass]" style="background-image:url($[properties.avatarUrl])"></div>'
      );
      const hintLayout = ymaps.templateLayoutFactory.createClass('<div class="map-hint">$[properties.hintText]</div>');
      const clusterLayout = ymaps.templateLayoutFactory.createClass(
        '<div class="map-cluster">$[properties.geoObjects.length]</div>'
      );
      const userLayout = ymaps.templateLayoutFactory.createClass('<div class="map-user-marker"></div>');

      layoutRef.current = { marker: markerLayout, hint: hintLayout, cluster: clusterLayout, user: userLayout };

      const clusterer = new ymaps.Clusterer({
        clusterDisableClickZoom: true,
        clusterOpenBalloonOnClick: false,
        clusterIconLayout: clusterLayout,
        clusterIconShape: {
          type: "Circle",
          coordinates: [24, 24],
          radius: 24,
        },
        clusterIconOffset: [-24, -24],
      });

      // Тап по кластеру раздвигает его, пока это возможно; когда метки стоят
      // в одном здании (студия с несколькими мастерами) или масштаб уже
      // предельный, — показывает первую карточку, остальные рядом в полосе.
      clusterer.events.add("click", (event: YMapEvent) => {
        const target = event.get("target");
        if (!isCluster(target)) return;

        const items = target
          .getGeoObjects()
          .map((geo) => geo.properties.get("data"))
          .filter(isCatalogMapPoint);
        if (items.length === 0) return;

        const bounds = boundsOf(items);
        const span = Math.max(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]);
        const activeMap = mapRef.current;
        if (!activeMap || span < SAME_PLACE_SPAN_DEG || activeMap.getZoom() >= CLUSTER_EXPAND_MAX_ZOOM) {
          onSelectRef.current(items[0]!.id);
          return;
        }
        markProgrammaticMove();
        // motion-canon: API Яндекс.Карт — длительность в миллисекундах, не framer.
        activeMap.setBounds(bounds, { checkZoomRange: true, zoomMargin: 64, duration: 300 });
      });

      map.events.add("actionend", () => {
        if (performance.now() < programmaticUntilRef.current) return;
        setDirtyArea(true);
      });

      mapRef.current = map;
      clustererRef.current = clusterer;
      map.geoObjects.add(clusterer);

      setMapStatus("ready");
    } catch (error) {
      setMapStatus("error");
      setMapError(error instanceof Error ? error.message : UI_TEXT.catalog.map.loadFailed);
      ymapsLoader = null;
    }
  }, [markProgrammaticMove]);

  // INIT ONCE (do NOT depend on props/callbacks/theme/coords)
  useEffect(() => {
    mountedRef.current = true;
    void initMap();

    return () => {
      mountedRef.current = false;
      if (geoNoticeTimerRef.current !== null) window.clearTimeout(geoNoticeTimerRef.current);
      destroyMap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map initialization runs once on mount
  }, []);

  // theme sync (no re-init)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const customization = resolvedTheme === "dark" ? darkMapCustomization : lightMapCustomization;
    map.options.set("customization", customization);
  }, [mapStatus, resolvedTheme]);

  // render points (no re-init)
  useEffect(() => {
    if (mapStatus !== "ready") return;

    const map = mapRef.current;
    const clusterer = clustererRef.current;
    const layouts = layoutRef.current;
    const ymaps = (window as YMapsWindow).ymaps;

    if (!map || !clusterer || !layouts || !ymaps) return;

    clusterer.removeAll();
    placemarksRef.current.clear();

    const placemarks = points.map((point) => {
      const baseClass = point.type === "master" ? "marker-master" : "marker-studio";
      const avatarUrl =
        point.avatarUrl?.trim() || (point.type === "master" ? FALLBACK_MASTER_AVATAR : FALLBACK_STUDIO_AVATAR);

      const placemark = new ymaps.Placemark(
        [point.geoLat, point.geoLng],
        {
          data: point,
          typeClass: baseClass,
          avatarUrl,
          hintText: buildHintText(point.title, point.ratingAvg),
        },
        {
          iconLayout: layouts.marker,
          iconOffset: [-22, -22],
          iconShape: {
            type: "Circle",
            coordinates: [22, 22],
            radius: 22,
          },
          hintLayout: layouts.hint,
        }
      );

      // Тап по метке выбирает мастера (карточка в полосе под картой), а не
      // уводит в профиль: переход — осознанным тапом по карточке.
      placemark.events.add("click", () => onSelectRef.current(point.id));

      placemarksRef.current.set(point.id, { placemark, baseClass, point });
      return placemark;
    });

    clusterer.add(placemarks);

    if (autoFitRef.current && points.length > 0) {
      markProgrammaticMove();
      setDirtyArea(false);
      if (points.length === 1) {
        map.setCenter([points[0]!.geoLat, points[0]!.geoLng], MAP_ZOOM_ON_POINT);
      } else {
        map.setBounds(boundsOf(points), { checkZoomRange: true, zoomMargin: 64 });
      }
    }
  }, [mapStatus, points, markProgrammaticMove]);

  // selection sync: подсветка + выбранная метка поверх соседних
  useEffect(() => {
    placemarksRef.current.forEach(({ placemark, baseClass }, id) => {
      const selected = selectedId === id;
      placemark.properties.set("typeClass", selected ? `${baseClass} map-marker--active` : baseClass);
      if (selected) placemark.options.set("zIndex", 1000);
      else placemark.options.unset("zIndex");
    });
  }, [mapStatus, points, selectedId]);

  // follow selection from the carousel
  useEffect(() => {
    if (mapStatus !== "ready" || !followSelection || !selectedId) return;
    const map = mapRef.current;
    const entry = placemarksRef.current.get(selectedId);
    if (!map || !entry) return;

    const coords: [number, number] = [entry.point.geoLat, entry.point.geoLng];
    const clustered = Boolean(clustererRef.current?.getObjectState(entry.placemark)?.isClustered);
    markProgrammaticMove();
    if (clustered) {
      // motion-canon: API Яндекс.Карт — длительность в миллисекундах, не framer.
      map.setCenter(coords, Math.max(map.getZoom(), MAP_ZOOM_ON_POINT), { duration: 300 });
    } else {
      // motion-canon: API Яндекс.Карт — длительность в миллисекундах, не framer.
      map.panTo(coords, { duration: 300, flying: false });
    }
  }, [followSelection, mapStatus, markProgrammaticMove, selectedId]);

  // user marker (no recenter — центрирует только нажатие «Показать, где я»)
  useEffect(() => {
    if (mapStatus !== "ready") return;
    const map = mapRef.current;
    const layouts = layoutRef.current;
    const ymaps = (window as YMapsWindow).ymaps;
    if (!map || !layouts || !ymaps || !userCoords) return;

    if (userPlacemarkRef.current) {
      try {
        map.geoObjects.remove(userPlacemarkRef.current);
      } catch {
        // no-op
      }
      userPlacemarkRef.current = null;
    }

    const userPlacemark = new ymaps.Placemark(
      [userCoords.lat, userCoords.lng],
      {},
      {
        iconLayout: layouts.user,
        iconOffset: [-10, -10],
        iconShape: {
          type: "Circle",
          coordinates: [10, 10],
          radius: 10,
        },
        // NOTE: do NOT force pane here; reduces risk of setPane(null) edge-cases
      }
    );

    userPlacemarkRef.current = userPlacemark;
    try {
      map.geoObjects.add(userPlacemark);
    } catch {
      // no-op
    }
  }, [mapStatus, userCoords]);

  // Если доступ к геолокации уже выдан раньше, показываем точку «я здесь» без
  // диалога и без сдвига карты. Спросить впервые может только кнопка.
  useEffect(() => {
    if (mapStatus !== "ready" || userCoords) return;
    if (typeof navigator === "undefined" || !navigator.permissions || !navigator.geolocation) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled || !mountedRef.current) return;
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            cachedGeoCoords = coords;
            setUserCoords(coords);
          },
          () => undefined,
          { timeout: 7000, maximumAge: 300_000 }
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mapStatus, userCoords]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {mapStatus === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-sm text-muted-foreground">
          {UI_TEXT.catalog.map.loading}
        </div>
      ) : null}

      {mapStatus === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/40 text-center text-sm text-muted-foreground">
          <div>{mapError ?? UI_TEXT.catalog.map.loadFailed}</div>
          <Button
            variant="secondary"
            onClick={() => {
              destroyMap();
              void initMap();
            }}
            className="rounded-full"
          >
            {UI_TEXT.catalog.map.retry}
          </Button>
        </div>
      ) : null}

      {/* Верх карты: одно место под одно сообщение — либо идёт обновление,
          либо предложение искать в сдвинутой области. Раньше здесь в углах
          одновременно висели четыре плашки и перекрывали друг друга. */}
      {mapStatus === "ready" ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3">
          {loadingResults ? (
            <div
              role="status"
              className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card/95 px-4 py-2 text-xs text-text-sec shadow-card"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {UI_TEXT.catalog.map.updatingResults}
            </div>
          ) : searchEnabled && dirtyArea ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSearchArea}
              className="pointer-events-auto rounded-full shadow-card"
            >
              {UI_TEXT.catalog.map.searchArea}
            </Button>
          ) : null}

          {geoNotice ? (
            <div
              role="status"
              className="max-w-[320px] rounded-2xl border border-border-subtle bg-bg-card/95 px-3 py-2 text-center text-xs text-text-sec shadow-card"
            >
              {geoNotice}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Низ карты: над строкой копирайта Яндекса (её закрывать нельзя). */}
      {mapStatus === "ready" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex items-center justify-center px-3">
          {centerAction ? <div className="pointer-events-auto">{centerAction}</div> : null}
          <div className="pointer-events-auto absolute right-3">
            <Button
              variant="secondary"
              size="icon"
              onClick={locateUser}
              disabled={locating}
              aria-label={UI_TEXT.catalog.map.myLocation}
              title={UI_TEXT.catalog.map.myLocation}
              className="rounded-full shadow-card"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <LocateFixed className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
