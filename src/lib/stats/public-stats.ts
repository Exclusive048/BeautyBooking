import { prisma } from "@/lib/prisma";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";

export type PublicStats = {
  masters: number;
  services: number;
  bookings: number;
};

const CACHE_KEY = "public:stats";
const CACHE_TTL_SECONDS = 3600; // 1 hour

async function fetchFromDb(): Promise<PublicStats> {
  const [masters, services, bookings] = await Promise.all([
    prisma.provider.count({ where: { isPublished: true } }),
    prisma.service.count({ where: { isEnabled: true } }),
    prisma.booking.count({ where: { status: "FINISHED" } }),
  ]);
  return { masters, services, bookings };
}

export async function getPublicStats(): Promise<PublicStats> {
  try {
    const redis = await getRedisConnection();
    if (redis) {
      const raw = await withRedisCommandTimeout("public:stats:get", redis.get(CACHE_KEY));
      if (raw) {
        const parsed = JSON.parse(raw) as PublicStats;
        if (
          typeof parsed.masters === "number" &&
          typeof parsed.services === "number" &&
          typeof parsed.bookings === "number"
        ) {
          return parsed;
        }
      }
    }

    const stats = await fetchFromDb();

    if (redis) {
      await withRedisCommandTimeout(
        "public:stats:set",
        redis.set(CACHE_KEY, JSON.stringify(stats), { EX: CACHE_TTL_SECONDS })
      ).catch((err: unknown) => {
        logError("Failed to cache public stats", { error: String(err) });
      });
    }

    return stats;
  } catch (err) {
    logError("getPublicStats failed, falling back to DB", { error: String(err) });
    return fetchFromDb();
  }
}
