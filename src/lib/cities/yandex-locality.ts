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
/**
 * RES-10 — верхняя граница запроса к геокодеру.
 *
 * Этот путь дёргается при сохранении адреса кабинета (auto-grow города), то
 * есть внутри пользовательской правки: без границы зависший геокодер держит
 * запрос сохранения. Отказ здесь уже мягкий — исход `unavailable` и
 * `logError`, — но мягкость наступает ПОСЛЕ возврата вызова.
 */
const GEOCODE_REQUEST_TIMEOUT_MS = 5_000;

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
                /** ISO 3166-1 alpha-2 («RU»). 29.09 доработки · 27. */
                country_code?: string;
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
  /**
   * Названия регионов (компоненты `province`: федеральный округ, субъект; у
   * городов федерального значения — сам город). По ним новому городу
   * выбирается часовой пояс (`cities/region-timezone.ts`).
   */
  regions: string[];
  /**
   * Страна адреса (29.09 доработки · 27, только РФ). `code` — `country_code`
   * ответа; `name` — компонент `kind: "country"` (запасной путь, если кода
   * нет). Оба `null` — ответ страну не назвал; что тогда делать, решает
   * вызывающий (`isRussianCountry`).
   */
  country: { code: string | null; name: string | null };
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
 * GEOCODER-UNAVAILABLE-503 — исход геокодирования, а не «результат или null».
 *
 * Раньше любой отказ отдавал `null`: нет ключа, обрыв сети, таймаут, 5xx,
 * 429 и 403 исчерпанной квоты выглядели для вызывающего ровно как «адрес не
 * распознан». Вызывающий не мог поступить по-разному, и кабинет мастера на
 * ВРЕМЕННЫЙ сбой обнулял `cityId` — мастер молча выпадал из каталога до
 * следующего сохранения адреса при живом геокодере (A-03). Теперь это два
 * разных исхода:
 *   - `not_found` — сервис ОТВЕТИЛ, и в ответе нет точки (пустая выдача,
 *     нечитаемые координаты) либо отверг сам запрос (400 — повтор не поможет);
 *   - `unavailable` — сервис не ответил по существу: нет ключа, сеть, таймаут,
 *     ответ не JSON, любой не-OK статус кроме 400 (5xx, 429, 401/403 ключа и
 *     квоты). Повтор позже может помочь — поэтому вызывающий отказывает в
 *     записи, а не пишет адрес без города.
 *
 * Нет ключа — тоже `unavailable`: адрес нельзя проверить, и молча сохранить
 * его без города значило бы воспроизвести ту же поломку на неверной настройке.
 */
export type GeocodeLocalityOutcome =
  | { kind: "found"; result: YandexLocalityResult }
  | { kind: "not_found" }
  | { kind: "unavailable" };

/** 400 — Яндекс отверг сам запрос (параметр); повтор того же адреса не поможет. */
const HTTP_BAD_REQUEST = 400;

/** Geocode an address and extract coordinates + locality name. */
export async function geocodeWithLocality(address: string): Promise<GeocodeLocalityOutcome> {
  const apiKey = env.YANDEX_GEOCODER_API_KEY?.trim();
  if (!apiKey) {
    logError("yandex-locality.no_api_key", { hint: "Set YANDEX_GEOCODER_API_KEY" });
    return { kind: "unavailable" };
  }

  const url = new URL(YANDEX_GEOCODE_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("geocode", address);
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("format", "json");
  url.searchParams.set("results", "1");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(GEOCODE_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logError("yandex-locality.fetch_failed", { error: String(err) });
    return { kind: "unavailable" };
  }

  if (!response.ok) {
    logError("yandex-locality.http_error", { status: response.status });
    return response.status === HTTP_BAD_REQUEST ? { kind: "not_found" } : { kind: "unavailable" };
  }

  let payload: YandexGeocodeResponse | null = null;
  try {
    payload = (await response.json()) as YandexGeocodeResponse | null;
  } catch (err) {
    logError("yandex-locality.parse_failed", { error: String(err) });
    return { kind: "unavailable" };
  }

  const member = payload?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  if (!member) return { kind: "not_found" };

  const point = parsePoint(member.Point?.pos);
  if (!point) return { kind: "not_found" };

  const meta = member.metaDataProperty?.GeocoderMetaData?.Address;
  const components = meta?.Components;
  const locality = extractLocality(components);
  const countryComponent = (components ?? []).find((component) => component.kind === "country");
  const regions = (components ?? [])
    .filter((component) => component.kind === "province" && Boolean(component.name))
    .map((component) => component.name as string);

  return {
    kind: "found",
    result: {
      geoLat: point.geoLat,
      geoLng: point.geoLng,
      locality,
      regions,
      country: {
        code: meta?.country_code?.trim() || null,
        name: countryComponent?.name?.trim() || null,
      },
    },
  };
}
