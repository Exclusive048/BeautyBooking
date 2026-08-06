import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Избран ли ЭТОТ провайдер этим пользователем.
 *
 * PERF-22 — раньше на месте этой функции стоял `getFavoriteProviderIds`,
 * который тянул ВЕСЬ список избранного (без `take`) ради одного `has()` на
 * публичной странице мастера. Множество там ни для чего больше не
 * использовалось, поэтому вопрос сузился до того, каким он и был по
 * существу: есть ли одна строка. Ответ тот же, стоимость — точечный
 * `findUnique` по `@@unique([userId, providerId])` вместо чтения, растущего
 * вместе с числом избранных.
 *
 * `React.cache` сохранён: ключ теперь из двух аргументов, поэтому повторный
 * запрос той же пары в одном рендере по-прежнему идёт один раз.
 */
export const isProviderFavorited = cache(
  async (userId: string, providerId: string): Promise<boolean> => {
    const row = await prisma.userFavorite.findUnique({
      where: { userId_providerId: { userId, providerId } },
      select: { id: true },
    });
    return row !== null;
  },
);

/**
 * Favorited providers keyed by `publicUsername` — for public surfaces that
 * must not handle the internal CUID (catalog cards, QA-103). Skips favorites
 * whose provider has no publicUsername (cannot be matched on a public card).
 */
export const getFavoriteProviderUsernames = cache(async (userId: string): Promise<Set<string>> => {
  const rows = await prisma.userFavorite.findMany({
    where: { userId },
    select: { provider: { select: { publicUsername: true } } },
  });
  return new Set(
    rows
      .map((r) => r.provider?.publicUsername)
      .filter((u): u is string => Boolean(u)),
  );
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
