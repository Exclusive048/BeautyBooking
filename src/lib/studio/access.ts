import { MembershipStatus, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

function hasAllowedRole(userRoles: StudioRole[], allowed: StudioRole[]): boolean {
  return userRoles.some((role) => allowed.includes(role));
}

export async function ensureStudioRole(input: {
  studioId: string;
  userId: string;
  allowed: StudioRole[];
}): Promise<void> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: {
      id: true,
      ownerUserId: true,
      provider: { select: { ownerUserId: true } },
    },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const isOwner =
    studio.ownerUserId === input.userId || studio.provider.ownerUserId === input.userId;
  if (isOwner) return;

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId: input.studioId,
      userId: input.userId,
      status: MembershipStatus.ACTIVE,
    },
    select: { roles: true },
  });

  if (!membership || !hasAllowedRole(membership.roles, input.allowed)) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
}

