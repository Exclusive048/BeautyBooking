import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Returns the set of provider IDs the given user has favorited.
 * Wrapped in `React.cache` so multiple server components in the same render
 * tree share a single query instead of re-running it. The set datatype gives
 * O(1) lookups when annotating catalog items with `initialFavorited`.
 */
export const getFavoriteProviderIds = cache(async (userId: string): Promise<Set<string>> => {
  const rows = await prisma.userFavorite.findMany({
    where: { userId },
    select: { providerId: true },
  });
  return new Set(rows.map((r) => r.providerId));
});

/**
 * Total count of provider favorites for the given user. Used by the cabinet
 * sidebar nav badge. The count is cheap (indexed by userId) but cabinet
 * layout fires on every page navigation — if this becomes a hot path, add a
 * 30s Redis cache layer (mirroring `getMarketingPricing`). Not needed today
 * for the current row volume.
 */
export const getUserFavoritesCount = cache(async (userId: string): Promise<number> => {
  return prisma.userFavorite.count({ where: { userId } });
});
