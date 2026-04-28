import { cookies } from "next/headers";
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
