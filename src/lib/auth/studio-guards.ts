import { MembershipStatus, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api/response";

type GuardResult = ReturnType<typeof fail> | null;

function hasAnyRole(roles: StudioRole[], allowed: StudioRole[]) {
  return roles.some((role) => allowed.includes(role));
}

async function getStudioOwnership(studioId: string, userId: string) {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: {
      id: true,
      ownerUserId: true,
      provider: { select: { ownerUserId: true } },
    },
  });

  if (!studio) {
    return { studio: null as null, isOwner: false };
  }

  const isOwner =
    studio.ownerUserId === userId || studio.provider.ownerUserId === userId;

  return { studio, isOwner };
}

export async function ensureStudioMembership(
  studioId: string,
  userId: string,
  allowedRoles: StudioRole[]
): Promise<GuardResult> {
  const { studio, isOwner } = await getStudioOwnership(studioId, userId);
  if (!studio) return fail("Studio not found", 404, "STUDIO_NOT_FOUND");

  if (isOwner) return null;

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId,
      userId,
      status: MembershipStatus.ACTIVE,
    },
    select: { id: true, roles: true },
  });

  if (!membership || !hasAnyRole(membership.roles, allowedRoles)) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  return null;
}

export async function ensureStudioAccess(
  studioId: string,
  userId: string
): Promise<GuardResult> {
  return ensureStudioMembership(studioId, userId, [
    StudioRole.OWNER,
    StudioRole.ADMIN,
    StudioRole.MASTER,
  ]);
}

export async function ensureStudioAdmin(
  studioId: string,
  userId: string
): Promise<GuardResult> {
  return ensureStudioMembership(studioId, userId, [
    StudioRole.OWNER,
    StudioRole.ADMIN,
  ]);
}

export async function ensureStudioOwner(
  studioId: string,
  userId: string
): Promise<GuardResult> {
  return ensureStudioMembership(studioId, userId, [StudioRole.OWNER]);
}

export async function hasAnyStudioAccess(userId: string): Promise<boolean> {
  const owned = await prisma.studio.findFirst({
    where: {
      OR: [
        { ownerUserId: userId },
        { provider: { ownerUserId: userId } },
      ],
    },
    select: { id: true },
  });

  if (owned) return true;

  const membership = await prisma.studioMembership.findFirst({
    where: { userId, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });

  return Boolean(membership);
}
