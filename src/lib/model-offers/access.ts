import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

type MasterAccess = {
  id: string;
  name: string;
  timezone: string;
  studioId: string | null;
  ownerUserId: string | null;
};

async function isStudioAdmin(studioId: string, userId: string): Promise<boolean> {
  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId,
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function resolveMasterAccess(
  masterId: string,
  userId: string
): Promise<MasterAccess> {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, type: true, name: true, timezone: true, studioId: true, ownerUserId: true },
  });
  if (!master || master.type !== ProviderType.MASTER) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  if (master.ownerUserId && master.ownerUserId === userId) {
    return master;
  }

  if (master.studioId) {
    const studio = await prisma.studio.findUnique({
      where: { providerId: master.studioId },
      select: { id: true },
    });
    if (studio && (await isStudioAdmin(studio.id, userId))) {
      return master;
    }
  }

  throw new AppError("Forbidden", 403, "FORBIDDEN");
}
