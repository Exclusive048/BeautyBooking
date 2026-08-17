import { BookingStatus, NotificationType } from "@prisma/client";
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

type MasterDeletionResult = {
  providerId: string;
  providerName: string;
};

export async function deleteMasterCabinet(userId: string): Promise<void> {
  // DELETION-02: снимок ДО транзакции — после неё указателей на объекты уже не найти.
  const provider = await prisma.masterProfile.findUnique({
    where: { userId },
    select: { providerId: true },
  });
  const mediaToPurge = provider
    ? await collectProviderMedia(MediaEntityType.MASTER, provider.providerId)
    : [];

  const result = await prisma.$transaction(async (tx): Promise<MasterDeletionResult> => {
    const masterProfile = await tx.masterProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        providerId: true,
        provider: { select: { id: true, name: true } },
      },
    });

    if (!masterProfile) {
      throw new AppError("Профиль мастера не найден", 404, "NOT_FOUND");
    }

    const providerId = masterProfile.providerId;
    const activeCount = await tx.booking.count({
      where: {
        status: { in: ACTIVE_BOOKING_STATUSES },
        OR: [{ providerId }, { masterProviderId: providerId }],
      },
    });

    if (activeCount > 0) {
      throw new AppError("Есть активные записи", 409, "ACTIVE_BOOKINGS", {
        count: activeCount,
      });
    }

    await Promise.all([
      // DELETION-02 (PROVIDER-DANGLING-ROWS): каскад НЕ сработает — строка
      // Provider переживает удаление кабинета, поэтому чистим явно.
      tx.hotSlotSubscription.deleteMany({ where: { providerId } }),
      tx.userFavorite.deleteMany({ where: { providerId } }),
      tx.discountRule.deleteMany({ where: { providerId } }),
      tx.portfolioItem.deleteMany({ where: { masterId: providerId } }),
      tx.hotSlot.deleteMany({ where: { providerId } }),
      tx.modelOffer.deleteMany({ where: { masterId: providerId } }),
      // LOGIC-19: блоки времени этого мастера. До появления FK связь была
      // голой строкой — БД про неё не знала, и блоки оставались указывать на
      // удалённый кабинет навсегда (`loadTimeBlockRanges` ищет по `masterId`).
      // FK добавлен, но каскад тут по-прежнему не сработает — Provider
      // анонимизируется, а не удаляется.
      tx.timeBlock.deleteMany({ where: { masterId: providerId } }),
      tx.scheduleOverride.deleteMany({ where: { providerId } }),
      tx.scheduleBreak.deleteMany({ where: { providerId } }),
      tx.weeklyScheduleConfig.deleteMany({ where: { providerId } }),
      tx.scheduleTemplate.deleteMany({ where: { providerId } }),
      tx.scheduleChangeRequest.deleteMany({ where: { providerId } }),
      tx.masterService.deleteMany({ where: { masterProviderId: providerId } }),
      tx.clientNote.deleteMany({ where: { masterId: providerId } }),
      tx.clientCard.deleteMany({ where: { providerId } }),
      tx.review.deleteMany({ where: { authorId: userId } }),
      tx.studioMembership.deleteMany({ where: { userId } }),
      tx.studioMember.deleteMany({ where: { userId } }),
      tx.publicUsernameAlias.deleteMany({ where: { providerId } }),
      tx.service.deleteMany({
        where: {
          providerId,
          bookings: { none: {} },
        },
      }),
    ]);

    await tx.provider.update({
      where: { id: providerId },
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
        studioId: null,
      },
    });

    await tx.masterProfile.delete({ where: { id: masterProfile.id } });

    return {
      providerId,
      providerName: masterProfile.provider?.name || "Мастер",
    };
  });

  const title = "Кабинет мастера удалён";
  const body = "Ваш кабинет мастера удалён. Услуги, расписание и портфолио удалены.";

  try {
    await deliverNotification({
      userId,
      type: NotificationType.MASTER_CABINET_DELETED,
      title,
      body,
      payloadJson: { providerId: result.providerId, providerName: result.providerName },
      pushUrl: "/cabinet/roles",
    });
  } catch (error) {
    logError("Failed to send master deletion notification", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await enqueueMediaPurge(mediaToPurge, "master-cabinet-deletion", userId);

  logInfo("Master cabinet deleted", { userId });
}
