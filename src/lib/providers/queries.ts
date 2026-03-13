import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { mapProviderCard } from "@/lib/providers/mappers";
import {
  PROVIDER_LIST_DEFAULT_LIMIT,
  PROVIDER_LIST_MAX_LIMIT,
} from "@/lib/providers/schemas";

type ListProviderCardsInput = {
  cursor?: string | null;
  limit?: number;
};

export async function listProviderCards(input: ListProviderCardsInput = {}) {
  const limit = Math.min(Math.max(input.limit ?? PROVIDER_LIST_DEFAULT_LIMIT, 1), PROVIDER_LIST_MAX_LIMIT);
  const cursorId = input.cursor?.trim();

  if (cursorId) {
    const cursorProvider = await prisma.provider.findFirst({
      where: {
        id: cursorId,
        isPublished: true,
      },
      select: { id: true },
    });
    if (!cursorProvider) {
      throw new AppError("Invalid cursor", 400, "VALIDATION_ERROR");
    }
  }

  const providers = await prisma.provider.findMany({
    where: { isPublished: true },
    orderBy: [{ rating: "desc" }, { reviews: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursorId
      ? {
          skip: 1,
          cursor: { id: cursorId },
        }
      : {}),
    select: {
      id: true,
      type: true,
      name: true,
      avatarUrl: true,
      avatarFocalX: true,
      avatarFocalY: true,
      tagline: true,
      rating: true,
      reviews: true,
      priceFrom: true,
      address: true,
      district: true,
      categories: true,
      availableToday: true,
    },
  });

  const hasMore = providers.length > limit;
  const pageItems = hasMore ? providers.slice(0, limit) : providers;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;

  return {
    items: pageItems.map(mapProviderCard),
    nextCursor,
  };
}
