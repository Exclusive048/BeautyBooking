import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

/**
 * Idempotent toggle: returns the post-state. Throws when the provider is
 * missing or unpublished — we don't want users hearting providers they can't
 * see in the catalog. Cascade on the FK keeps the row consistent if the
 * provider is later hard-deleted.
 */
export async function toggleProviderFavorite(
  userId: string,
  providerId: string,
): Promise<{ favorited: boolean }> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, isPublished: true },
  });
  if (!provider || !provider.isPublished) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  const existing = await prisma.userFavorite.findUnique({
    where: { userId_providerId: { userId, providerId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.userFavorite.delete({
      where: { userId_providerId: { userId, providerId } },
    });
    return { favorited: false };
  }

  await prisma.userFavorite.create({
    data: { userId, providerId },
  });
  return { favorited: true };
}
