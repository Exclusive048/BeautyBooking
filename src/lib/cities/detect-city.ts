import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { citySlugFromName, normalizeCityName } from "@/lib/cities/normalize";
import { timezoneForRegions } from "@/lib/cities/region-timezone";
import { isRussianCountry } from "@/lib/cities/country";
import { geocodeWithLocality } from "@/lib/cities/yandex-locality";

export type DetectCityResult =
  | {
      ok: true;
      cityId: string;
      cityName: string;
      /**
       * The resolved `City.timezone` (IANA). FIX-R2-02-A — providers derive
       * their `Provider.timezone` from this so a Moscow provider runs on
       * Europe/Moscow, not the stale Asia/Almaty schema default. Callers write
       * it onto the provider on address-save.
       */
      timezone: string;
      geoLat: number;
      geoLng: number;
      wasCreated: boolean;
    }
  | {
      ok: false;
      /**
       * `foreign_country` — адрес вне России (29.09 доработки · 27, RF-ONLY):
       * вызывающий отказывает в сохранении адреса, а не молча выводит из
       * каталога.
       */
      reason: "no_address" | "geocoder_failed" | "no_locality" | "foreign_country";
    };

const DEFAULT_TIMEZONE = "Europe/Moscow";
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Resolves an address string to a `City` row, creating one on the fly when
 * the locality returned by the geocoder isn't yet in the DB.
 *
 * Auto-grow contract: any locality Yandex recognises IN RUSSIA is admitted
 * (29.09 доработки · 27 — RF-ONLY-SCOPE-01 закрыт и для этого канала; страна —
 * `country_code` ответа геокодера). There is no city whitelist — admins curate
 * after the fact via /admin/cities.
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

  // 29.09 доработки · 27: только Россия. Проверка — до поиска города, а не
  // только до создания: иначе заведённая раньше «Алматы» продолжала бы
  // принимать адреса. Страны в ответе нет — пропускаем и пишем в лог (решение
  // владельца 27.2: ложный отказ стоит мастеру регистрации, а лог покажет,
  // насколько канал не закрыт).
  const russian = isRussianCountry(geo.country);
  if (russian === false) {
    return { ok: false, reason: "foreign_country" };
  }
  if (russian === null) {
    logInfo("city.country_unknown", { locality: geo.locality });
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
      timezone: city.timezone,
      geoLat: geo.geoLat,
      geoLng: geo.geoLng,
      wasCreated: false,
    };
  }

  // 3. AUTO-CREATE. Пояс — по субъекту РФ из ответа геокодера; раньше любой
  //    новый город получал Москву (Самара, Хабаровск…), и окошки съезжали.
  const timezone = timezoneForRegions(geo.regions ?? []) ?? DEFAULT_TIMEZONE;
  try {
    city = await prisma.city.create({
      data: {
        slug,
        name: normalizedName,
        nameGenitive: null,
        latitude: geo.geoLat,
        longitude: geo.geoLng,
        timezone,
        isActive: true,
        sortOrder: 100,
        autoCreated: true,
      },
    });
    // Адрес в лог не пишется: это персональные данные мастера, а для
    // диагностики довольно города и выбранного пояса.
    logInfo("city.auto_created", {
      citySlug: slug,
      cityName: normalizedName,
      timezone,
      regions: geo.regions ?? [],
    });
    return {
      ok: true,
      cityId: city.id,
      cityName: city.name,
      timezone: city.timezone,
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
          timezone: existing.timezone,
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
