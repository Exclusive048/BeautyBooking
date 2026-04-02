import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type PortfolioServiceOption = {
  serviceId: string;
  title: string;
  durationMin: number;
  price: number;
};

export type PortfolioFeedItem = {
  id: string;
  mediaUrl: string;
  visualSearchReady: boolean;
  caption: string | null;
  width: number | null;
  height: number | null;
  masterId: string;
  masterName: string;
  masterPublicUsername: string | null;
  masterAvatarUrl: string | null;
  masterRatingAvg: number;
  studioName: string | null;
  serviceIds: string[];
  primaryServiceTitle: string | null;
  totalDurationMin: number;
  totalPrice: number;
  favoritesCount: number;
  isFavorited: boolean;
};

export type PortfolioDetail = PortfolioFeedItem & {
  serviceOptions: PortfolioServiceOption[];
  nearestSlots: Array<{ startAt: string }>;
  similarItems: Array<{
    id: string;
    mediaUrl: string;
    masterName: string;
    totalPrice: number;
  }>;
};

function resolveServiceOption(input: {
  masterId: string;
  service: {
    id: string;
    name: string;
    title: string | null;
    price: number;
    durationMin: number;
    masterServices: Array<{
      masterProviderId: string;
      isEnabled: boolean;
      priceOverride: number | null;
      durationOverrideMin: number | null;
    }>;
  };
}): PortfolioServiceOption {
  const override = input.service.masterServices.find(
    (ms) => ms.masterProviderId === input.masterId && ms.isEnabled
  );

  return {
    serviceId: input.service.id,
    title: input.service.title?.trim() || input.service.name,
    durationMin: override?.durationOverrideMin ?? input.service.durationMin,
    price: override?.priceOverride ?? input.service.price,
  };
}

function extractMediaAssetId(mediaUrl: string): string | null {
  const directMatch = mediaUrl.match(/\/api\/media\/file\/([^/?#]+)/i);
  if (directMatch?.[1]) return directMatch[1];

  try {
    const parsed = new URL(mediaUrl);
    const pathMatch = parsed.pathname.match(/\/api\/media\/file\/([^/?#]+)/i);
    return pathMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

async function buildVisualSearchReadyMapByUrl(mediaUrls: string[]): Promise<Map<string, boolean>> {
  if (mediaUrls.length === 0) return new Map<string, boolean>();

  const assetIdByUrl = new Map<string, string>();
  for (const mediaUrl of mediaUrls) {
    const assetId = extractMediaAssetId(mediaUrl);
    if (assetId) {
      assetIdByUrl.set(mediaUrl, assetId);
    }
  }

  const assetIds = Array.from(new Set(assetIdByUrl.values()));
  if (assetIds.length === 0) {
    return new Map(mediaUrls.map((mediaUrl) => [mediaUrl, false]));
  }

  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: { in: assetIds },
      deletedAt: null,
    },
    select: {
      id: true,
      visualIndexed: true,
      visualCategory: true,
    },
  });

  const readyByAssetId = new Map<string, boolean>(
    assets.map((asset) => [asset.id, asset.visualIndexed && asset.visualCategory !== null])
  );

  const readyByUrl = new Map<string, boolean>();
  for (const mediaUrl of mediaUrls) {
    const assetId = assetIdByUrl.get(mediaUrl);
    readyByUrl.set(mediaUrl, assetId ? readyByAssetId.get(assetId) === true : false);
  }

  return readyByUrl;
}

function buildPortfolioSnapshot(input: {
  masterId: string;
  services: Array<{
    service: {
      id: string;
      name: string;
      title: string | null;
      price: number;
      durationMin: number;
      masterServices: Array<{
        masterProviderId: string;
        isEnabled: boolean;
        priceOverride: number | null;
        durationOverrideMin: number | null;
      }>;
    };
  }>;
}): {
  serviceOptions: PortfolioServiceOption[];
  totalDurationMin: number;
  totalPrice: number;
  primaryServiceTitle: string | null;
  serviceIds: string[];
} {
  const serviceOptions = input.services.map((link) =>
    resolveServiceOption({ masterId: input.masterId, service: link.service })
  );

  const totalDurationMin = serviceOptions.reduce((sum, option) => sum + option.durationMin, 0);
  const totalPrice = serviceOptions.reduce((sum, option) => sum + option.price, 0);

  return {
    serviceOptions,
    totalDurationMin,
    totalPrice,
    primaryServiceTitle: serviceOptions[0]?.title ?? null,
    serviceIds: serviceOptions.map((option) => option.serviceId),
  };
}

function isDeletedCursorError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function listPortfolioFeed(input: {
  limit: number;
  cursor?: string;
  q?: string;
  categoryId?: string;
  tag?: string;
  near?: string;
  masterId?: string;
  currentUserId?: string;
}): Promise<{ items: PortfolioFeedItem[]; nextCursor: string | null }> {
  const pageSize = Math.max(1, Math.min(50, input.limit));

  const loadRows = (cursor?: string) =>
    prisma.portfolioItem.findMany({
      where: {
        isPublic: true,
        ...(input.masterId ? { masterId: input.masterId } : {}),
        ...(input.q
          ? {
              OR: [
                { caption: { contains: input.q, mode: "insensitive" } },
                { master: { name: { contains: input.q, mode: "insensitive" } } },
                { services: { some: { service: { name: { contains: input.q, mode: "insensitive" } } } } },
                { services: { some: { service: { title: { contains: input.q, mode: "insensitive" } } } } },
              ],
            }
          : {}),
        ...(input.categoryId
          ? {
              OR: [
                { services: { some: { service: { categoryId: input.categoryId } } } },
                { services: { some: { service: { name: { contains: input.categoryId, mode: "insensitive" } } } } },
                { services: { some: { service: { title: { contains: input.categoryId, mode: "insensitive" } } } } },
                { master: { categories: { has: input.categoryId } } },
              ],
            }
          : {}),
        ...(input.tag
          ? {
              OR: [
                { caption: { contains: input.tag, mode: "insensitive" } },
                { services: { some: { service: { title: { contains: input.tag, mode: "insensitive" } } } } },
                { services: { some: { service: { name: { contains: input.tag, mode: "insensitive" } } } } },
              ],
            }
          : {}),
      },
      include: {
        master: {
          select: {
            id: true,
            name: true,
            publicUsername: true,
            avatarUrl: true,
            ratingAvg: true,
            studio: { select: { name: true } },
          },
        },
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                title: true,
                price: true,
                durationMin: true,
                masterServices: {
                  select: {
                    masterProviderId: true,
                    isEnabled: true,
                    priceOverride: true,
                    durationOverrideMin: true,
                  },
                },
              },
            },
          },
        },
        favorites: input.currentUserId
          ? {
              where: { userId: input.currentUserId },
              select: { id: true },
            }
          : false,
        _count: { select: { favorites: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pageSize + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    });

  const rows = await (async () => {
    try {
      return await loadRows(input.cursor);
    } catch (error) {
      if (!input.cursor || !isDeletedCursorError(error)) throw error;
      return loadRows();
    }
  })();

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, -1) : rows;
  const visualReadyByUrl = await buildVisualSearchReadyMapByUrl(pageRows.map((row) => row.mediaUrl));

  const items = pageRows.map((row) => {
    const snapshot = buildPortfolioSnapshot({ masterId: row.master.id, services: row.services });
    return {
      id: row.id,
      mediaUrl: row.mediaUrl,
      visualSearchReady: visualReadyByUrl.get(row.mediaUrl) === true,
      caption: row.caption ?? null,
      width: row.width ?? null,
      height: row.height ?? null,
      masterId: row.master.id,
      masterName: row.master.name,
      masterPublicUsername: row.master.publicUsername ?? null,
      masterAvatarUrl: row.master.avatarUrl ?? null,
      masterRatingAvg: row.master.ratingAvg,
      studioName: row.master.studio?.name ?? null,
      serviceIds: snapshot.serviceIds,
      primaryServiceTitle: snapshot.primaryServiceTitle,
      totalDurationMin: snapshot.totalDurationMin,
      totalPrice: snapshot.totalPrice,
      favoritesCount: row._count.favorites,
      isFavorited: Array.isArray(row.favorites) ? row.favorites.length > 0 : false,
    } satisfies PortfolioFeedItem;
  });

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  };
}

export async function listHomePortfolioFeed(input: {
  limit: number;
  cursor?: string;
  globalCategoryId?: string;
  categoryId?: string;
  tagId?: string;
  currentUserId?: string;
}): Promise<{ items: PortfolioFeedItem[]; nextCursor: string | null }> {
  const pageSize = Math.max(1, Math.min(50, input.limit));
  const globalCategoryId = input.globalCategoryId ?? input.categoryId;

  const loadRows = (cursor?: string) =>
    prisma.portfolioItem.findMany({
      where: {
        isPublic: true,
        ...(globalCategoryId
          ? {
              services: {
                some: {
                  service: { globalCategoryId },
                },
              },
            }
          : {}),
        ...(input.tagId
          ? {
              tags: {
                some: { tagId: input.tagId },
              },
            }
          : {}),
      },
      include: {
        master: {
          select: {
            id: true,
            name: true,
            publicUsername: true,
            avatarUrl: true,
            ratingAvg: true,
            studio: { select: { name: true } },
          },
        },
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                title: true,
                price: true,
                durationMin: true,
                masterServices: {
                  select: {
                    masterProviderId: true,
                    isEnabled: true,
                    priceOverride: true,
                    durationOverrideMin: true,
                  },
                },
              },
            },
          },
        },
        favorites: input.currentUserId
          ? {
              where: { userId: input.currentUserId },
              select: { id: true },
            }
          : false,
        _count: { select: { favorites: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pageSize + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    });

  const rows = await (async () => {
    try {
      return await loadRows(input.cursor);
    } catch (error) {
      if (!input.cursor || !isDeletedCursorError(error)) throw error;
      return loadRows();
    }
  })();

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, -1) : rows;
  const visualReadyByUrl = await buildVisualSearchReadyMapByUrl(pageRows.map((row) => row.mediaUrl));

  const items = pageRows.map((row) => {
    const snapshot = buildPortfolioSnapshot({ masterId: row.master.id, services: row.services });
    return {
      id: row.id,
      mediaUrl: row.mediaUrl,
      visualSearchReady: visualReadyByUrl.get(row.mediaUrl) === true,
      caption: row.caption ?? null,
      width: row.width ?? null,
      height: row.height ?? null,
      masterId: row.master.id,
      masterName: row.master.name,
      masterPublicUsername: row.master.publicUsername ?? null,
      masterAvatarUrl: row.master.avatarUrl ?? null,
      masterRatingAvg: row.master.ratingAvg,
      studioName: row.master.studio?.name ?? null,
      serviceIds: snapshot.serviceIds,
      primaryServiceTitle: snapshot.primaryServiceTitle,
      totalDurationMin: snapshot.totalDurationMin,
      totalPrice: snapshot.totalPrice,
      favoritesCount: row._count.favorites,
      isFavorited: Array.isArray(row.favorites) ? row.favorites.length > 0 : false,
    } satisfies PortfolioFeedItem;
  });

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  };
}

export async function getPortfolioDetail(
  portfolioId: string,
  currentUserId?: string
): Promise<PortfolioDetail> {
  const item = await prisma.portfolioItem.findUnique({
    where: { id: portfolioId },
    include: {
      master: {
        select: {
          id: true,
          name: true,
          publicUsername: true,
          avatarUrl: true,
          ratingAvg: true,
          studio: { select: { name: true } },
        },
      },
      services: {
        include: {
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              price: true,
              durationMin: true,
              masterServices: {
                select: {
                  masterProviderId: true,
                  isEnabled: true,
                  priceOverride: true,
                  durationOverrideMin: true,
                },
              },
            },
          },
        },
      },
      favorites: currentUserId
        ? {
            where: { userId: currentUserId },
            select: { id: true },
          }
        : false,
      _count: { select: { favorites: true } },
    },
  });

  if (!item || !item.isPublic) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  const snapshot = buildPortfolioSnapshot({ masterId: item.master.id, services: item.services });
  const visualReadyByUrl = await buildVisualSearchReadyMapByUrl([item.mediaUrl]);

  const similarRows = await prisma.portfolioItem.findMany({
    where: {
      isPublic: true,
      id: { not: item.id },
      OR: [
        { masterId: item.master.id },
        {
          services: {
            some: {
              serviceId: {
                in: snapshot.serviceIds,
              },
            },
          },
        },
      ],
    },
    include: {
      master: { select: { id: true, name: true } },
      services: {
        include: {
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              price: true,
              durationMin: true,
              masterServices: {
                select: {
                  masterProviderId: true,
                  isEnabled: true,
                  priceOverride: true,
                  durationOverrideMin: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 8,
  });

  const similarItems = similarRows.map((similar) => {
    const similarSnapshot = buildPortfolioSnapshot({
      masterId: similar.master.id,
      services: similar.services,
    });
    return {
      id: similar.id,
      mediaUrl: similar.mediaUrl,
      masterName: similar.master.name,
      totalPrice: similarSnapshot.totalPrice,
    };
  });

  return {
    id: item.id,
    mediaUrl: item.mediaUrl,
    visualSearchReady: visualReadyByUrl.get(item.mediaUrl) === true,
    caption: item.caption ?? null,
    width: item.width ?? null,
    height: item.height ?? null,
    masterId: item.master.id,
    masterName: item.master.name,
    masterPublicUsername: item.master.publicUsername ?? null,
    masterAvatarUrl: item.master.avatarUrl ?? null,
    masterRatingAvg: item.master.ratingAvg,
    studioName: item.master.studio?.name ?? null,
    serviceIds: snapshot.serviceIds,
    primaryServiceTitle: snapshot.primaryServiceTitle,
    totalDurationMin: snapshot.totalDurationMin,
    totalPrice: snapshot.totalPrice,
    serviceOptions: snapshot.serviceOptions,
    favoritesCount: item._count.favorites,
    isFavorited: Array.isArray(item.favorites) ? item.favorites.length > 0 : false,
    nearestSlots: [],
    similarItems,
  };
}

export async function togglePortfolioFavorite(input: {
  portfolioId: string;
  userId: string;
}): Promise<{ isFavorited: boolean; favoritesCount: number }> {
  const item = await prisma.portfolioItem.findUnique({
    where: { id: input.portfolioId },
    select: { id: true, isPublic: true },
  });

  if (!item || !item.isPublic) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  const existing = await prisma.favorite.findUnique({
    where: {
      userId_portfolioItemId: {
        userId: input.userId,
        portfolioItemId: input.portfolioId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.favorite.delete({
      where: {
        userId_portfolioItemId: {
          userId: input.userId,
          portfolioItemId: input.portfolioId,
        },
      },
    });
  } else {
    await prisma.favorite.create({
      data: {
        userId: input.userId,
        portfolioItemId: input.portfolioId,
      },
    });
  }

  const favoritesCount = await prisma.favorite.count({ where: { portfolioItemId: input.portfolioId } });

  return {
    isFavorited: !existing,
    favoritesCount,
  };
}
