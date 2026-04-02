"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { providerPublicUrl } from "@/lib/public-urls";
import type { CatalogMapPoint } from "@/features/catalog/types";
import { UI_TEXT } from "@/lib/ui/text";

type MapSearchPayload = {
  bbox: string;
  center: { lat: number; lng: number };
};

type CatalogMapProps = {
  points: CatalogMapPoint[];
  itemsCount: number;
  missingCount: number;
  activeId: string | null;
  searchEnabled: boolean;
  loadingResults: boolean;
  showEmptySearchNote: boolean;
  onSearchArea: (payload: MapSearchPayload, source: "manual" | "auto") => void;
  onClusterSelect: (items: CatalogMapPoint[]) => void;
};

type YTemplateLayout = Record<string, unknown>;

type YMapEvent = {
  get: (key: string) => unknown;
};

type YPlacemark = {
  properties: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
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
  events: {
    add: (name: string, cb: () => void) => void;
  };
  setBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
  setCenter: (center: [number, number], zoom?: number, options?: Record<string, unknown>) => void;
  getBounds: () => [[number, number], [number, number]] | null;
  getCenter: () => [number, number];
  options: {
    set: (key: string, value: unknown) => void;
  };
  destroy: () => void;
};

type YGeocodeResult = {
  geoObjects?: { get?: (index: number) => { properties?: { get?: (key: string) => unknown } } | null };
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
  geocode: (request: number[] | string, options?: Record<string, unknown>) => Promise<YGeocodeResult>;
};

type YMapsWindow = Window & { ymaps?: YMapsApi };

const DEFAULT_CENTER = { lat: 43.238949, lng: 76.889709 };
const DEFAULT_ZOOM = 11;
const MAP_ZOOM_ON_GEO = 13;
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
let geoRequestedOnce = false;
let cachedGeoCoords: { lat: number; lng: number } | null = null;

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
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

function formatLocation(address: { city?: string; district?: string; street?: string } | null): string | null {
  if (!address) return null;
  const parts = [address.city, address.district, address.street].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

type YAddressComponent = {
  kind?: string;
  name?: string;
};

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

export function CatalogMap({
  points,
  itemsCount,
  missingCount,
  activeId,
  searchEnabled,
  loadingResults,
  showEmptySearchNote,
  onSearchArea,
  onClusterSelect,
}: CatalogMapProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  const clustererRef = useRef<YClusterer | null>(null);
  const placemarksRef = useRef(new Map<string, { placemark: YPlacemark; baseClass: string }>());
  const userPlacemarkRef = useRef<YPlacemark | null>(null);
  const layoutRef = useRef<{
    marker: YTemplateLayout;
    hint: YTemplateLayout;
    cluster: YTemplateLayout;
    user: YTemplateLayout;
  } | null>(null);

  const suppressDirtyRef = useRef(0);
  const geoAutoSearchRef = useRef(false);
  const mountedRef = useRef(false);

  // IMPORTANT: keep latest callbacks without reinitializing the map
  const onClusterSelectRef = useRef(onClusterSelect);
  const onSearchAreaRef = useRef(onSearchArea);

  useEffect(() => {
    onClusterSelectRef.current = onClusterSelect;
  }, [onClusterSelect]);

  useEffect(() => {
    onSearchAreaRef.current = onSearchArea;
  }, [onSearchArea]);

  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapError, setMapError] = useState<string | null>(null);
  const [dirtyArea, setDirtyArea] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "requesting" | "granted" | "denied" | "error">("idle");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(cachedGeoCoords);
  const [userAddress, setUserAddress] = useState<{ city?: string; district?: string; street?: string } | null>(null);

  const locationText = useMemo(() => formatLocation(userAddress), [userAddress]);

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

  const requestGeolocation = useCallback((force = false) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (geoRequestedOnce && !force) return;

    geoRequestedOnce = true;
    setGeoStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cachedGeoCoords = coords;

        if (!mountedRef.current) return;
        setGeoStatus("granted");
        setUserCoords(coords);

        void (async () => {
          try {
            const ymaps = await loadYmaps();
            // component could unmount while awaiting
            if (!mountedRef.current) return;

            const res = await ymaps.geocode([coords.lat, coords.lng], { results: 1 });
            if (!mountedRef.current) return;

            const first = res?.geoObjects?.get?.(0);
            const meta = first?.properties?.get?.("metaDataProperty") as
              | { GeocoderMetaData?: { Address?: { Components?: YAddressComponent[] } } }
              | undefined;

            const components = meta?.GeocoderMetaData?.Address?.Components ?? [];
            const city =
              components.find((item) => item.kind === "locality")?.name ||
              components.find((item) => item.kind === "province")?.name ||
              components.find((item) => item.kind === "area")?.name;
            const district = components.find((item) => item.kind === "district")?.name;
            const street = components.find((item) => item.kind === "street")?.name;

            setUserAddress({ city, district, street });
          } catch {
            if (!mountedRef.current) return;
            setUserAddress(null);
          }
        })();
      },
      (err) => {
        if (!mountedRef.current) return;
        if (err.code === err.PERMISSION_DENIED) setGeoStatus("denied");
        else setGeoStatus("error");
      },
      { timeout: 7000, enableHighAccuracy: true }
    );
  }, []);

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

    suppressDirtyRef.current = 0;
    geoAutoSearchRef.current = false;
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

      const map = new ymaps.Map(
        mapContainerRef.current,
        {
          center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
          zoom: DEFAULT_ZOOM,
          controls: ["zoomControl"],
        },
        { suppressMapOpenBlock: true }
      );

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

      clusterer.events.add("click", (event: YMapEvent) => {
        const target = event.get("target");
        if (!isCluster(target)) return;

        const items = target
          .getGeoObjects()
          .map((geo) => geo.properties.get("data"))
          .filter(isCatalogMapPoint);

        onClusterSelectRef.current(items);
      });

      map.events.add("actionend", () => {
        if (suppressDirtyRef.current > 0) {
          suppressDirtyRef.current -= 1;
          return;
        }
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
  }, []);

  // INIT ONCE (do NOT depend on props/callbacks/theme/coords)
  useEffect(() => {
    mountedRef.current = true;
    void initMap();

    return () => {
      mountedRef.current = false;
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
  }, [resolvedTheme]);

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

      placemark.events.add("click", () => {
        const href = providerPublicUrl({ id: point.id, publicUsername: point.publicUsername }, "catalog-map");
        router.push(href);
      });

      placemarksRef.current.set(point.id, { placemark, baseClass });
      return placemark;
    });

    clusterer.add(placemarks);

    if (points.length > 0) {
      const lats = points.map((p) => p.geoLat);
      const lngs = points.map((p) => p.geoLng);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];

      suppressDirtyRef.current = 2;
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 64 });
    }
  }, [mapStatus, points, router]);

  // hover sync
  useEffect(() => {
    placemarksRef.current.forEach(({ placemark, baseClass }, id) => {
      const nextClass = activeId === id ? `${baseClass} map-marker--active` : baseClass;
      placemark.properties.set("typeClass", nextClass);
    });
  }, [activeId]);

  // apply geolocation to map (no re-init)
  useEffect(() => {
    if (mapStatus !== "ready") return;
    const map = mapRef.current;
    if (!map) return;
    if (!userCoords) return;

    suppressDirtyRef.current = 2;
    map.setCenter([userCoords.lat, userCoords.lng], MAP_ZOOM_ON_GEO, { duration: 300 });

    // remove previous user marker
    if (userPlacemarkRef.current) {
      try {
        map.geoObjects.remove(userPlacemarkRef.current);
      } catch {
        // no-op
      }
      userPlacemarkRef.current = null;
    }

    const layouts = layoutRef.current;
    const ymaps = (window as YMapsWindow).ymaps;
    if (!layouts || !ymaps) return;

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

    if (searchEnabled && !geoAutoSearchRef.current && itemsCount === 0) {
      const payload = buildSearchPayload();
      if (payload) {
        geoAutoSearchRef.current = true;
        onSearchAreaRef.current(payload, "auto");
      }
    }
  }, [buildSearchPayload, itemsCount, mapStatus, searchEnabled, userCoords]);

  // auto-request geolocation once after map is ready
  useEffect(() => {
    if (mapStatus !== "ready") return;
    const timer = window.setTimeout(() => requestGeolocation(false), 0);
    return () => window.clearTimeout(timer);
  }, [mapStatus, requestGeolocation]);

  return (
    <div className="relative h-full min-h-[60vh] w-full">
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

      {mapStatus === "ready" && loadingResults ? (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
          <div className="rounded-full border border-border bg-background/90 px-4 py-2 text-xs text-muted-foreground shadow-sm">
            {UI_TEXT.catalog.map.updatingResults}
          </div>
        </div>
      ) : null}

      {mapStatus === "ready" && showEmptySearchNote ? (
        <div className="pointer-events-none absolute inset-x-4 top-24 z-10 rounded-2xl border border-border bg-background/95 p-3 text-center text-xs text-muted-foreground shadow-sm">
          {UI_TEXT.catalog.map.emptyArea}
        </div>
      ) : null}

      {mapStatus === "ready" && missingCount > 0 ? (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
          {UI_TEXT.catalog.map.missingCoords(missingCount)}
        </div>
      ) : null}

      {mapStatus === "ready" && locationText ? (
        <div className="pointer-events-none absolute left-4 top-14 z-10 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
          {UI_TEXT.catalog.map.yourLocation} {locationText}
        </div>
      ) : null}

      {mapStatus === "ready" && geoStatus === "denied" ? (
        <div className="pointer-events-none absolute left-4 top-24 z-10 max-w-[320px] rounded-2xl border border-border bg-background/95 p-3 text-xs text-muted-foreground shadow-sm">
          {UI_TEXT.catalog.map.geoAccessDenied}
        </div>
      ) : null}

      {mapStatus === "ready" && geoStatus === "error" ? (
        <div className="pointer-events-none absolute left-4 top-24 z-10 max-w-[320px] rounded-2xl border border-border bg-background/95 p-3 text-xs text-muted-foreground shadow-sm">
          {UI_TEXT.catalog.map.geoError}
        </div>
      ) : null}

      {mapStatus === "ready" && searchEnabled && dirtyArea ? (
        <div className="absolute inset-x-0 top-4 z-10 flex justify-center">
          <Button
            variant="secondary"
            onClick={handleSearchArea}
            className="rounded-full shadow-sm"
          >
            {UI_TEXT.catalog.map.searchArea}
          </Button>
        </div>
      ) : null}

      {mapStatus === "ready" ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => requestGeolocation(true)}
          className="absolute right-4 top-4 z-10 rounded-full shadow-sm"
        >
          {UI_TEXT.catalog.map.myLocation}
        </Button>
      ) : null}
    </div>
  );
}
