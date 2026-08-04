import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

/**
 * Idempotent toggle: returns the post-state. Throws when the provider is
 * missing or unpublished — we don't want users hearting providers they can't
 * see in the catalog. Cascade on the FK keeps the row consistent if the
 * provider is later hard-deleted.
 *
 * Accepts EITHER the internal `providerId` (authed cabinet / public-profile
 * surfaces that already resolved it server-side) OR the public
 * `providerUsername` (catalog cards — QA-103, the public search no longer
 * emits the CUID). The username is resolved to the internal id here.
 */
export async function toggleProviderFavorite(
  userId: string,
  ref: { providerId?: string; providerUsername?: string },
): Promise<{ favorited: boolean }> {
  const provider = await prisma.provider.findFirst({
    where: ref.providerId
      ? { id: ref.providerId }
      : { publicUsername: ref.providerUsername },
    select: { id: true, isPublished: true },
  });
  if (!provider || !provider.isPublished) {
    throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }
  const providerId = provider.id;

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
