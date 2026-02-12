import { AccountType, MediaEntityType, MediaKind, MembershipStatus, ProviderType, StudioRole, type UserProfile } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { resolveMasterAccess } from "@/lib/model-offers/access";

function isSiteAdmin(user: UserProfile): boolean {
  return user.roles.includes(AccountType.ADMIN) || user.roles.includes(AccountType.SUPERADMIN);
}

async function isStudioAdminOrOwnerByStudioProviderId(studioProviderId: string, userId: string): Promise<boolean> {
  const studioProvider = await prisma.provider.findUnique({
    where: { id: studioProviderId },
    select: { id: true, type: true, ownerUserId: true },
  });
  if (!studioProvider || studioProvider.type !== ProviderType.STUDIO) return false;
  if (studioProvider.ownerUserId === userId) return true;

  const studio = await prisma.studio.findUnique({
    where: { providerId: studioProvider.id },
    select: { id: true, ownerUserId: true },
  });
  if (!studio) return false;
  if (studio.ownerUserId === userId) return true;

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId: studio.id,
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function ensureCanManageMedia(
  user: UserProfile,
  entityType: MediaEntityType,
  entityId: string,
  kind: MediaKind
): Promise<void> {
  if (entityType === MediaEntityType.SITE) {
    const isAllowedSiteKind = kind === MediaKind.AVATAR || kind === MediaKind.PORTFOLIO;
    if (entityId !== "site" || !isAllowedSiteKind || !isSiteAdmin(user)) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
    return;
  }

  if (entityType === MediaEntityType.USER) {
    const isAllowedUserKind = kind === MediaKind.AVATAR || kind === MediaKind.MODEL_APPLICATION_PHOTO;
    if (!isAllowedUserKind || entityId !== user.id) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
    return;
  }

  if (entityType === MediaEntityType.MODEL_APPLICATION) {
    const application = await prisma.modelApplication.findUnique({
      where: { id: entityId },
      select: { id: true, clientUserId: true, offer: { select: { masterId: true } } },
    });
    if (!application) {
      throw new AppError("Not found", 404, "NOT_FOUND");
    }
    if (application.clientUserId === user.id) return;
    await resolveMasterAccess(application.offer.masterId, user.id);
    return;
  }

  if (entityType === MediaEntityType.MASTER) {
    const master = await prisma.provider.findUnique({
      where: { id: entityId },
      select: { id: true, type: true, ownerUserId: true, studioId: true },
    });
    if (!master || master.type !== ProviderType.MASTER) {
      throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
    }
    if (master.ownerUserId === user.id) return;
    if (master.studioId && (await isStudioAdminOrOwnerByStudioProviderId(master.studioId, user.id))) return;
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (entityType === MediaEntityType.STUDIO) {
    const canManage = await isStudioAdminOrOwnerByStudioProviderId(entityId, user.id);
    if (!canManage) throw new AppError("Forbidden", 403, "FORBIDDEN");
    return;
  }

  throw new AppError("Forbidden", 403, "FORBIDDEN");
}

export async function ensureCanReadMedia(
  user: UserProfile | null,
  entityType: MediaEntityType,
  entityId: string
): Promise<void> {
  if (entityType === MediaEntityType.USER) {
    if (!user || (user.id !== entityId && !isSiteAdmin(user))) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
    return;
  }

  if (entityType === MediaEntityType.SITE && entityId !== "site") {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  if (entityType === MediaEntityType.MODEL_APPLICATION) {
    if (!user) throw new AppError("Forbidden", 403, "FORBIDDEN");
    const application = await prisma.modelApplication.findUnique({
      where: { id: entityId },
      select: { id: true, clientUserId: true, offer: { select: { masterId: true } } },
    });
    if (!application) {
      throw new AppError("Not found", 404, "NOT_FOUND");
    }
    if (application.clientUserId === user.id) return;
    await resolveMasterAccess(application.offer.masterId, user.id);
    return;
  }
}
