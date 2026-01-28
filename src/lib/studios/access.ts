import { MembershipStatus, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api/response";

export async function ensureStudioAccess(studioProviderId: string, userId: string) {
  const provider = await prisma.provider.findUnique({
    where: { id: studioProviderId },
    select: { id: true, type: true, ownerUserId: true },
  });

  if (!provider || provider.type !== ProviderType.STUDIO) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  if (provider.ownerUserId === userId) return null;

  const studio = await prisma.studio.findUnique({
    where: { providerId: provider.id },
    select: { id: true },
  });

  if (!studio) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  const membership = await prisma.studioMembership.findFirst({
    where: { studioId: studio.id, userId, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });

  if (!membership) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  return null;
}
