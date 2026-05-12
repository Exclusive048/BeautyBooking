import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";

/**
 * Server-side Yandex Geocoder call that returns coordinates AND locality.
 *
 * The existing `/api/address/geocode/route.ts` extracts only the `Point.pos`
 * field. Multi-city needs the locality name, which lives deeper in the
 * response under `metaDataProperty.GeocoderMetaData.AddressDetails`. Rather
 * than expanding the existing route (which is consumed by client-side
 * useAddressWithGeocode), this helper is a separate server-only call that
 * lives next to the city-detect flow.
 */

const YANDEX_GEOCODE_URL = "https://geocode-maps.yandex.ru/1.x/";

type YandexAddressComponent = {
  kind?: string;
  name?: string;
};

type YandexGeocodeResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: {
          Point?: { pos?: string };
          metaDataProperty?: {
            GeocoderMetaData?: {
              Address?: {
                Components?: YandexAddressComponent[];
              };
            };
          };
        };
      }>;
    };
  };
};

export type YandexLocalityResult = {
  geoLat: number;
  geoLng: number;
  locality: string | null;
};

function parsePoint(pos: string | undefined): { geoLat: number; geoLng: number } | null {
  if (!pos) return null;
  // Yandex returns "lng lat" (note the order)
  const parts = pos.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { geoLat: lat, geoLng: lng };
}

/**
 * Pulls the `locality` component (city) out of the Components array.
 *
 * Yandex `kind` values we accept as "city":
 *   - "locality"  — most common (Moscow, Voronezh, Krasnodar)
 *   - "province"  — fallback for country-level subjects when locality is missing
 *
 * Federal cities (Москва, Санкт-Петербург, Севастополь) appear as both a
 * `province` AND a `locality`; we prefer `locality`.
 */
function extractLocality(components: YandexAddressComponent[] | undefined): string | null {
  if (!components || components.length === 0) return null;
  const locality = components.find((c) => c.kind === "locality");
  if (locality?.name) return locality.name;
  const province = components.find((c) => c.kind === "province");
  return province?.name ?? null;
}

/**
 * Geocode an address and extract coordinates + locality name.
 *
 * Returns `null` if the geocoder is unavailable, the API key is missing,
 * the response is empty, or coordinates can't be parsed.
 */
export async function geocodeWithLocality(address: string): Promise<YandexLocalityResult | null> {
  const apiKey = env.YANDEX_GEOCODER_API_KEY?.trim();
  if (!apiKey) {
    logError("yandex-locality.no_api_key", { hint: "Set YANDEX_GEOCODER_API_KEY" });
    return null;
  }

  const url = new URL(YANDEX_GEOCODE_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("geocode", address);
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("format", "json");
  url.searchParams.set("results", "1");

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: "no-store" });
  } catch (err) {
    logError("yandex-locality.fetch_failed", { error: String(err) });
    return null;
  }

  if (!response.ok) {
    logError("yandex-locality.http_error", { status: response.status });
    return null;
  }

  let payload: YandexGeocodeResponse | null = null;
  try {
    payload = (await response.json()) as YandexGeocodeResponse | null;
  } catch (err) {
    logError("yandex-locality.parse_failed", { error: String(err) });
    return null;
  }

  const member = payload?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  if (!member) return null;

  const point = parsePoint(member.Point?.pos);
  if (!point) return null;

  const locality = extractLocality(
    member.metaDataProperty?.GeocoderMetaData?.Address?.Components,
  );

  return {
    geoLat: point.geoLat,
    geoLng: point.geoLng,
    locality,
  };
}
