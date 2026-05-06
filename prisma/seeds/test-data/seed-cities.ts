import type { City } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { RUSSIAN_CITIES } from "./data/russian-cities";

/**
 * Upsert each seed city by `slug`. The `autoCreated: false` flag matches
 * what /admin/cities sets when an admin manually approves a city — keeps
 * seed cities stable against the auto-grow detect-city flow.
 */
export async function seedCities(): Promise<City[]> {
  logSeed.section("Cities");
  const out: City[] = [];
  for (const c of RUSSIAN_CITIES) {
    const row = await prisma.city.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        nameGenitive: c.nameGenitive,
        latitude: c.latitude,
        longitude: c.longitude,
        timezone: c.timezone,
        sortOrder: c.sortOrder,
        isActive: true,
        autoCreated: false,
      },
      create: {
        slug: c.slug,
        name: c.name,
        nameGenitive: c.nameGenitive,
        latitude: c.latitude,
        longitude: c.longitude,
        timezone: c.timezone,
        sortOrder: c.sortOrder,
        isActive: true,
        autoCreated: false,
      },
    });
    out.push(row);
  }
  logSeed.ok(`${out.length} cities upserted`);
  return out;
}
