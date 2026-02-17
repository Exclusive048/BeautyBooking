import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";

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

function getGeocodeKey(): string {
  const key = process.env.YANDEX_GEOCODER_API_KEY ?? "";
  const trimmed = key.trim();
  if (!trimmed) {
    throw new AppError("Geocoding unavailable", 503, "INTERNAL_ERROR");
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

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = getGeocodeKey();
  const url = new URL(YANDEX_GEOCODE_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("geocode", query);
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("format", "json");
  url.searchParams.set("results", "1");

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    throw new AppError("Geocoding unavailable", 502, "INTERNAL_ERROR", {
      reason: "fetch_failed",
    });
  }

  if (!response.ok) {
    throw new AppError("Geocoding unavailable", 502, "INTERNAL_ERROR", {
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
  return parsePoint(pos);
}

export async function GET(req: Request) {
  try {
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
