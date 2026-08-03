import {
  BookingStatus,
  MembershipStatus,
  NotificationType,
  ProviderType,
  StudioMemberRole,
  StudioMemberStatus,
  StudioRole,
} from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { MediaEntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { collectProviderMedia } from "@/lib/media/purge";
import { enqueueMediaPurge } from "@/lib/deletion/enqueue-media-purge";
import { deliverNotification } from "@/lib/notifications/delivery";
import { logError, logInfo } from "@/lib/logging/logger";

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "NEW",
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
];

type StudioDeletionResult = {
  studioId: string;
  studioName: string;
  memberUserIds: string[];
};

export async function deleteStudioCabinet(userId: string): Promise<void> {
  // DELETION-02: снимок ДО транзакции (см. delete-master).
  const owned = await prisma.studio.findFirst({
    where: { ownerUserId: userId },
    select: { providerId: true },
  });
  const mediaToPurge = owned?.providerId
    ? await collectProviderMedia(MediaEntityType.STUDIO, owned.providerId)
    : [];

  const result = await prisma.$transaction(async (tx): Promise<StudioDeletionResult> => {
    const studio = await tx.studio.findFirst({
      where: {
        OR: [
          { ownerUserId: userId },
          {
            memberships: {
              some: {
                userId,
                status: MembershipStatus.ACTIVE,
                roles: { has: StudioRole.OWNER },
              },
            },
          },
          {
            studioMembers: {
              some: {
                userId,
                status: StudioMemberStatus.ACTIVE,
                role: StudioMemberRole.OWNER,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        ownerUserId: true,
        providerId: true,
        provider: { select: { id: true, name: true } },
      },
    });

    if (!studio) {
      throw new AppError("Студия не найдена", 404, "NOT_FOUND");
    }

    const masterProviders = await tx.provider.findMany({
      where: { studioId: studio.providerId, type: ProviderType.MASTER },
      select: { id: true },
    });
    const masterIds = masterProviders.map((item) => item.id);

    const activeCount = await tx.booking.count({
      where: {
        status: { in: ACTIVE_BOOKING_STATUSES },
        OR: [
          { studioId: studio.id },
          { providerId: studio.providerId },
          ...(masterIds.length ? [{ masterProviderId: { in: masterIds } }] : []),
        ],
      },
    });

    if (activeCount > 0) {
      throw new AppError("Есть активные записи", 409, "ACTIVE_BOOKINGS", {
        count: activeCount,
      });
    }

    const memberships = await tx.studioMembership.findMany({
      where: { studioId: studio.id, status: MembershipStatus.ACTIVE },
      select: { userId: true },
    });
    const members = await tx.studioMember.findMany({
      where: { studioId: studio.id, status: StudioMemberStatus.ACTIVE },
      select: { userId: true },
    });
    const memberUserIds = new Set<string>();
    for (const item of memberships) memberUserIds.add(item.userId);
    for (const item of members) memberUserIds.add(item.userId);
    if (studio.ownerUserId) memberUserIds.add(studio.ownerUserId);

    await tx.modelOffer.updateMany({
      where: {
        status: "ACTIVE",
        masterService: {
          is: { studioId: studio.id },
        },
      },
      data: { status: "ARCHIVED" },
    });

    await Promise.all([
      tx.studioMembership.deleteMany({ where: { studioId: studio.id } }),
      tx.studioMember.deleteMany({ where: { studioId: studio.id } }),
      tx.studioInvite.deleteMany({ where: { studioId: studio.id } }),
      tx.scheduleChangeRequest.deleteMany({ where: { studioId: studio.id } }),
      tx.serviceCategory.deleteMany({ where: { studioId: studio.id } }),
      tx.masterService.deleteMany({ where: { studioId: studio.id } }),
      tx.publicUsernameAlias.deleteMany({ where: { providerId: studio.providerId } }),
      // DELETION-02 (PROVIDER-DANGLING-ROWS): те же три указателя на провайдера,
      // что и в delete-master — каскад не срабатывает, строка Provider выживает.
      tx.hotSlotSubscription.deleteMany({ where: { providerId: studio.providerId } }),
      tx.userFavorite.deleteMany({ where: { providerId: studio.providerId } }),
      tx.discountRule.deleteMany({ where: { providerId: studio.providerId } }),
      tx.service.deleteMany({
        where: {
          providerId: studio.providerId,
          bookings: { none: {} },
        },
      }),
      tx.provider.updateMany({
        where: { studioId: studio.providerId, type: ProviderType.MASTER },
        data: { studioId: null },
      }),
    ]);

    await tx.provider.update({
      where: { id: studio.providerId },
      data: {
        isPublished: false,
        publicUsername: null,
        publicUsernameUpdatedAt: null,
        avatarUrl: null,
        description: null,
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        address: "",
        district: "",
        geoLat: null,
        geoLng: null,
      },
    });

    await tx.studio.delete({ where: { id: studio.id } });

    return {
      studioId: studio.id,
      studioName: studio.provider?.name || "Студия",
      memberUserIds: Array.from(memberUserIds),
    };
  });

  const title = "Студия расформирована";
  const body = `Студия «${result.studioName}» расформирована. Кабинет студии больше недоступен.`;

  for (const memberId of result.memberUserIds) {
    try {
      await deliverNotification({
        userId: memberId,
        type: NotificationType.STUDIO_DISBANDED,
        title,
        body,
        payloadJson: { studioId: result.studioId, studioName: result.studioName },
        pushUrl: "/cabinet/roles",
      });
    } catch (error) {
      logError("Failed to send studio disbanded notification", {
        userId: memberId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await enqueueMediaPurge(mediaToPurge, "studio-cabinet-deletion", userId);

  logInfo("Studio cabinet deleted", { userId, studioId: result.studioId });
}
