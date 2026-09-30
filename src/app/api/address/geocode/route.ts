import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/http/ip";
import {
  normalizeAddressQuery,
  readAddressCache,
  writeAddressCache,
} from "@/lib/maps/address-cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(1).max(240),
});

type YandexGeocodeResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: {
          Point?: { pos?: string };
        };
      }>;
    };
  };
};

const YANDEX_GEOCODE_URL = "https://geocode-maps.yandex.ru/1.x/";
/** RES-10 — верхняя граница запроса к геокодеру (см. комментарий у вызова). */
const GEOCODE_REQUEST_TIMEOUT_MS = 5_000;

function getGeocodeKey(): string {
  const key = env.YANDEX_GEOCODER_API_KEY ?? "";
  const trimmed = key.trim();
  if (!trimmed) {
    throw new AppError("Сервис адресов временно недоступен. Попробуйте позже.", 503, "INTERNAL_ERROR");
  }
  return trimmed;
}

function parsePoint(value?: string): { lat: number; lng: number } | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

type GeocodeCoords = { lat: number; lng: number };

async function geocodeAddress(query: string): Promise<GeocodeCoords | null> {
  // SEC-04: повторный геокод того же адреса не должен стоить платного вызова.
  const cacheParts = [normalizeAddressQuery(query)] as const;
  const cached = await readAddressCache<{ coords: GeocodeCoords | null }>(
    "geocode",
    cacheParts,
  );
  if (cached) return cached.coords;

  const apiKey = getGeocodeKey();
  const url = new URL(YANDEX_GEOCODE_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("geocode", query);
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("format", "json");
  url.searchParams.set("results", "1");

  let response: Response;
  try {
    // RES-10: граница обязательна — роут анонимный, а зависший геокодер
    // держит слот обработки и не даёт признака «таймаут» ни в одном логе.
    // 5 с: адрес геокодируется за сотни миллисекунд, дольше пользователь всё
    // равно не ждёт подсказку на вводе.
    response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(GEOCODE_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AppError("Сервис адресов временно недоступен. Попробуйте позже.", 502, "INTERNAL_ERROR", {
      reason: "fetch_failed",
    });
  }

  if (!response.ok) {
    throw new AppError("Сервис адресов временно недоступен. Попробуйте позже.", 502, "INTERNAL_ERROR", {
      status: response.status,
    });
  }

  let payload: YandexGeocodeResponse | null = null;
  try {
    payload = (await response.json()) as YandexGeocodeResponse | null;
  } catch {
    payload = null;
  }

  const pos =
    payload?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos;
  const coords = parsePoint(pos);
  // Ненайденный адрес кэшируется тоже — иначе «мусорный» запрос остаётся
  // платным при каждом повторе. Поэтому значение обёрнуто в объект: `null`
  // внутри него — это ответ, а `null` из кэша — промах.
  await writeAddressCache("geocode", cacheParts, { coords });
  return coords;
}

export async function GET(req: Request) {
  try {
    // SEC-04: собственный тир — цена запроса здесь в деньгах, а не в CPU, и
    // не должна зависеть от настроек общего публичного лимита.
    const limit = await checkRateLimit(
      routeRateLimitKey(req, "ip", getClientIp(req)),
      RATE_LIMITS.addressGeocode,
    );
    if (limit.limited) {
      throw new AppError("Слишком много запросов. Попробуйте позже.", 429, "RATE_LIMITED");
    }

    const query = parseQuery(new URL(req.url), querySchema);
    const coords = await geocodeAddress(query.q);
    return jsonOk({ coords });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/address/geocode failed", {
        requestId: getRequestId(req),
        route: "GET /api/address/geocode",
        details: appError.details,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
