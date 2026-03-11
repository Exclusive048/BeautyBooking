import * as cache from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

export type MeIdentity = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  externalPhotoUrl: string | null;
};

export const ME_CACHE_TTL_SECONDS = 30;

function buildMeCacheKey(userId: string): string {
  return `me:${userId}`;
}

export async function getCachedMeIdentity(userId: string): Promise<MeIdentity | null> {
  return cache.get<MeIdentity>(buildMeCacheKey(userId));
}

export async function setCachedMeIdentity(userId: string, user: MeIdentity): Promise<void> {
  await cache.set(buildMeCacheKey(userId), user, ME_CACHE_TTL_SECONDS);
}

export async function invalidateMeIdentityCache(userId: string): Promise<void> {
  await cache.del(buildMeCacheKey(userId));
}

export async function getMeIdentityFromDb(userId: string): Promise<MeIdentity | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      id: true,
      roles: true,
      displayName: true,
      phone: true,
      email: true,
      externalPhotoUrl: true,
      isDeleted: true,
    },
  });

  if (!profile || profile.isDeleted) return null;
  return {
    id: profile.id,
    roles: profile.roles,
    displayName: profile.displayName,
    phone: profile.phone,
    email: profile.email,
    externalPhotoUrl: profile.externalPhotoUrl,
  };
}
