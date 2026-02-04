import { MembershipStatus, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

type StudioAccessRow = {
  studioId: string;
  roles: StudioRole[];
  studio: { providerId: string };
};

function scoreRoles(roles: StudioRole[]): number {
  if (roles.includes(StudioRole.OWNER)) return 300;
  if (roles.includes(StudioRole.ADMIN)) return 200;
  if (roles.includes(StudioRole.MASTER)) return 100;
  return 0;
}

export async function resolveCurrentStudioAccess(userId: string): Promise<{
  studioId: string;
  providerId: string;
  roles: StudioRole[];
}> {
  const memberships = await prisma.studioMembership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN, StudioRole.MASTER] },
    },
    select: {
      studioId: true,
      roles: true,
      studio: { select: { providerId: true } },
    },
  });

  if (memberships.length === 0) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const ranked = [...memberships].sort((a, b) => {
    const roleDiff = scoreRoles(b.roles) - scoreRoles(a.roles);
    if (roleDiff !== 0) return roleDiff;
    return a.studioId.localeCompare(b.studioId);
  }) as StudioAccessRow[];

  const selected = ranked[0];
  return {
    studioId: selected.studioId,
    providerId: selected.studio.providerId,
    roles: selected.roles,
  };
}

