import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { citySlugFromName, normalizeCityName } from "@/lib/cities/normalize";
import { geocodeWithLocality } from "@/lib/cities/yandex-locality";

export type DetectCityResult =
  | {
      ok: true;
      cityId: string;
      cityName: string;
      geoLat: number;
      geoLng: number;
      wasCreated: boolean;
    }
  | {
      ok: false;
      reason: "no_address" | "geocoder_failed" | "no_locality";
    };

const DEFAULT_TIMEZONE = "Europe/Moscow";
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Resolves an address string to a `City` row, creating one on the fly when
 * the locality returned by the geocoder isn't yet in the DB.
 *
 * Auto-grow contract: any locality Yandex recognises is admitted. There is no
 * city whitelist — admins curate after the fact via /admin/cities.
 *
 * Race-handling: when two providers in two parallel requests register from a
 * brand-new city, one of them races to `prisma.city.create`. The loser hits a
 * P2002 unique-violation on `slug`; we recover by re-fetching the row created
 * by the winner. No retries, no transactions — the second provider just sees
 * the first provider's city.
 */
export async function detectCityFromAddress(
  address: string | null | undefined,
): Promise<DetectCityResult> {
  if (!address || !address.trim()) {
    return { ok: false, reason: "no_address" };
  }

  const geo = await geocodeWithLocality(address);
  if (!geo) {
    return { ok: false, reason: "geocoder_failed" };
  }

  if (!geo.locality) {
    return { ok: false, reason: "no_locality" };
  }

  const normalizedName = normalizeCityName(geo.locality);
  if (!normalizedName) {
    return { ok: false, reason: "no_locality" };
  }
  const slug = citySlugFromName(normalizedName);
  if (!slug) {
    return { ok: false, reason: "no_locality" };
  }

  // 1. Lookup by slug (most reliable — already normalized).
  let city = await prisma.city.findUnique({ where: { slug } });

  // 2. Fallback: case-insensitive name match. Defensive — covers the case where
  //    an admin manually created a city with a slightly different slug than
  //    what we'd compute. We treat that admin-created row as the canonical one.
  if (!city) {
    city = await prisma.city.findFirst({
      where: { name: { equals: normalizedName, mode: "insensitive" } },
    });
  }

  if (city) {
    return {
      ok: true,
      cityId: city.id,
      cityName: city.name,
      geoLat: geo.geoLat,
      geoLng: geo.geoLng,
      wasCreated: false,
    };
  }

  // 3. AUTO-CREATE.
  try {
    city = await prisma.city.create({
      data: {
        slug,
        name: normalizedName,
        nameGenitive: null,
        latitude: geo.geoLat,
        longitude: geo.geoLng,
        timezone: DEFAULT_TIMEZONE,
        isActive: true,
        sortOrder: 100,
        autoCreated: true,
      },
    });
    logInfo("city.auto_created", {
      citySlug: slug,
      cityName: normalizedName,
      triggerAddress: address,
    });
    return {
      ok: true,
      cityId: city.id,
      cityName: city.name,
      geoLat: geo.geoLat,
      geoLng: geo.geoLng,
      wasCreated: true,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === PRISMA_UNIQUE_VIOLATION
    ) {
      // Race: another request just created this city. Re-fetch.
      const existing = await prisma.city.findUnique({ where: { slug } });
      if (existing) {
        return {
          ok: true,
          cityId: existing.id,
          cityName: existing.name,
          geoLat: geo.geoLat,
          geoLng: geo.geoLng,
          wasCreated: false,
        };
      }
    }
    logError("city.auto_create_failed", { slug, error: String(err) });
    return { ok: false, reason: "geocoder_failed" };
  }
}
