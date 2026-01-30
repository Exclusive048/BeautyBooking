import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api/response";

export async function ensureStudioAccess(
  studioProviderId: string,
  userId: string
) {
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
    select: { id: true, ownerUserId: true },
  });

  if (!studio) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  if (studio.ownerUserId === userId) return null;

  const membership = await prisma.studioMembership.findFirst({
    where: { studioId: studio.id, userId, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });

  if (!membership) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  return null;
}

export async function ensureStudioAdmin(
  studioProviderId: string,
  userId: string
) {
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
    select: { id: true, ownerUserId: true },
  });

  if (!studio) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  if (studio.ownerUserId === userId) return null;

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId: studio.id,
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { id: true },
  });

  if (!membership) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  return null;
}

export async function ensureStudioOwner(
  studioProviderId: string,
  userId: string
) {
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
    select: { id: true, ownerUserId: true },
  });

  if (!studio) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  if (studio.ownerUserId === userId) return null;

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId: studio.id,
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { has: StudioRole.OWNER },
    },
    select: { id: true },
  });

  if (!membership) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  return null;
}

export async function ensureStudioAdminOrMasterSelf(
  studioProviderId: string,
  masterProviderId: string,
  userId: string
) {
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
    select: { id: true, ownerUserId: true },
  });

  if (!studio) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  if (studio.ownerUserId === userId) return null;

  const adminMembership = await prisma.studioMembership.findFirst({
    where: {
      studioId: studio.id,
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { id: true },
  });

  if (adminMembership) return null;

  const master = await prisma.provider.findUnique({
    where: { id: masterProviderId },
    select: { id: true, type: true, ownerUserId: true, studioId: true },
  });

  if (
    master &&
    master.type === ProviderType.MASTER &&
    master.ownerUserId === userId &&
    master.studioId === studioProviderId
  ) {
    return null;
  }

  return fail("Forbidden", 403, "FORBIDDEN");
}
