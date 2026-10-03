import { cookies } from "next/headers";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { CITY_COOKIE_NAME } from "@/lib/cities/client-city";

export type ServerCity = {
  id: string;
  slug: string;
  name: string;
  nameGenitive: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
};

/**
 * Reads the user's selected city from the cookie set by client-city.ts.
 *
 * Returns null when:
 *   - the cookie is absent (first visit, or user never picked a city);
 *   - the slug points to a city that no longer exists or was deactivated.
 *
 * The cookie itself is NOT cleaned up — a deactivated city may come back, and
 * the user's choice is theirs to revoke. Callers that need a fallback (catalog
 * default city, etc.) handle the null case explicitly.
 */
export async function getServerCity(): Promise<ServerCity | null> {
  const cookieStore = await cookies();
  const slug = cookieStore.get(CITY_COOKIE_NAME)?.value;
  if (!slug) return null;
  return findActiveCityBySlug(slug);
}

/** Активный город по slug (`City.slug`, его же хранит кука `mr-city-slug`); иначе `null`. */
export async function findActiveCityBySlug(slug: string): Promise<ServerCity | null> {
  const city = await prisma.city.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      nameGenitive: true,
      latitude: true,
      longitude: true,
      timezone: true,
      isActive: true,
    },
  });

  if (!city || !city.isActive) return null;

  return {
    id: city.id,
    slug: city.slug,
    name: city.name,
    nameGenitive: city.nameGenitive,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone,
  };
}

/**
 * MOBILE-B1 — явный город в запросе: `?city=<slug>`.
 *
 * Веб выбирает город кукой `mr-city-slug` (slug, ставит клиент —
 * `client-city.ts`), а у нативного приложения кук нет. Поэтому публичные
 * JSON-эндпоинты, зависящие от города, принимают тот же slug параметром, и он
 * ГЛАВНЕЕ куки. Список городов и их slug — `GET /api/cities`.
 *
 * Разница с кукой — в отказе. Кука — фоновое состояние браузера: битая или
 * погашенная админом ведёт к «все города» молча (так было и остаётся).
 * Параметр — явная просьба клиента, и молча подменить «Казань» на «все
 * города» значило бы показать чужую выдачу под заголовком выбранного города;
 * поэтому неизвестный/неактивный slug — 400 `CITY_NOT_FOUND`, и приложение
 * предлагает выбрать город заново. Схема параметра — `city-param.ts`.
 */
export async function resolveCityParam(slug: string | undefined): Promise<ServerCity | null> {
  if (!slug) return null;
  const city = await findActiveCityBySlug(slug);
  if (!city) {
    throw new AppError("Город не найден. Выберите город из списка.", 400, "CITY_NOT_FOUND", { city: slug });
  }
  return city;
}

/** Явный `?city=` главнее куки; без параметра — кука, как на вебе. */
export async function resolveRequestCity(slug: string | undefined): Promise<ServerCity | null> {
  return slug ? resolveCityParam(slug) : getServerCity();
}
