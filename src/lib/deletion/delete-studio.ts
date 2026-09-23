import {
  AccountType,
  MembershipStatus,
  NotificationType,
  ProviderType,
  StudioMemberRole,
  StudioMemberStatus,
  StudioRole,
  type Prisma,
} from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { hasAnyStudioAffiliation, removeProfessionalRoles } from "@/lib/auth/roles";
import { MediaEntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { collectProviderMedia } from "@/lib/media/purge";
import { enqueueMediaPurge } from "@/lib/deletion/enqueue-media-purge";
import { deliverNotification } from "@/lib/notifications/delivery";
import { logError, logInfo } from "@/lib/logging/logger";
import { countBlockingStudioBookings } from "@/lib/deletion/active-bookings";
import { CABINET_DELETION_TX_TIMEOUT_MS, type CabinetDeletionOptions } from "@/lib/deletion/delete-master";

/**
 * Студия, которой пользователь владеет: по `ownerUserId` либо по OWNER-членству.
 * Один предикат на снимок медиа, транзакцию и цикл удаления аккаунта — раньше
 * снимок искал только по `ownerUserId`, а транзакция шире и без порядка, то
 * есть медиа могло сниматься с одной студии, а удаляться другая.
 */
export function ownedStudioWhere(userId: string): Prisma.StudioWhereInput {
  return {
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
  };
}

type StudioDeletionResult = {
  studioId: string;
  studioName: string;
  memberUserIds: string[];
};

export async function deleteStudioCabinet(userId: string, options: CabinetDeletionOptions = {}): Promise<void> {
  // DELETION-02: снимок ДО транзакции (см. delete-master).
  const target = await prisma.studio.findFirst({
    where: ownedStudioWhere(userId),
    orderBy: { createdAt: "asc" },
    select: { id: true, providerId: true },
  });
  if (!target) {
    throw new AppError("Студия не найдена", 404, "NOT_FOUND");
  }
  const mediaToPurge = await collectProviderMedia(MediaEntityType.STUDIO, target.providerId);

  const result = await prisma.$transaction(async (tx): Promise<StudioDeletionResult> => {
    const studio = await tx.studio.findFirst({
      where: { AND: [{ id: target.id }, ownedStudioWhere(userId)] },
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

    // DELETION-03: только записи, которые видит и может закрыть сама студия.
    // Прежний третий клоз (`masterProviderId in <мастера команды>`) ловил и
    // записи мастеров с их ЛИЧНЫХ страниц — студия их не видит, закрыть не
    // может, а удаление студии их не затрагивает.
    const activeCount = await countBlockingStudioBookings(tx, studio);

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
      // DELETION-03: CRM студии — карточки клиентов (заметки/теги/фото — инв. #25,
      // 152-ФЗ) пережили бы удаление студии: провайдер студии не удаляется.
      tx.clientCard.deleteMany({ where: { providerId: studio.providerId } }),
      // DELETION-03: объявлены в карте диспозиций как DELETED, но не удалялись.
      tx.servicePackage.deleteMany({ where: { masterId: studio.providerId } }),
      tx.hotSlot.deleteMany({ where: { providerId: studio.providerId } }),
      tx.modelOffer.deleteMany({ where: { masterId: studio.providerId } }),
      tx.scheduleOverride.deleteMany({ where: { providerId: studio.providerId } }),
      tx.scheduleBreak.deleteMany({ where: { providerId: studio.providerId } }),
      tx.weeklyScheduleConfig.deleteMany({ where: { providerId: studio.providerId } }),
      tx.scheduleTemplate.deleteMany({ where: { providerId: studio.providerId } }),
      tx.service.deleteMany({
        where: {
          providerId: studio.providerId,
          bookings: { none: {} },
        },
      }),
    ]);

    // Приглашённые, но не принявшие мастера — заглушки студии без владельца:
    // уходят с витрины и теряют контакты приглашённого (имя/телефон).
    await tx.provider.updateMany({
      where: { studioId: studio.providerId, type: ProviderType.MASTER, ownerUserId: null },
      data: { isPublished: false, contactName: null, contactPhone: null, contactEmail: null },
    });
    await tx.provider.updateMany({
      where: { studioId: studio.providerId, type: ProviderType.MASTER },
      // STUDIO-PAUSE-SPLIT-01: пауза — свойство членства в студии, уходит вместе с ним.
      data: { studioId: null, studioPaused: false },
    });

    // Услуги с историей броней остаются (FK), но продаваться не должны.
    await tx.service.updateMany({ where: { providerId: studio.providerId }, data: { isActive: false } });

    // DELETION-03: платная подписка студии больше не продлевается сама.
    await tx.userSubscription.updateMany({
      where: { userId, scope: "STUDIO", autoRenew: true },
      data: { autoRenew: false, cancelAtPeriodEnd: true, nextBillingAt: null },
    });

    await tx.provider.update({
      where: { id: studio.providerId },
      data: {
        // DELETION-03: связь с владельцем рвётся (карта диспозиций) — иначе
        // повторное создание студии подхватило бы анонимизированную строку.
        ownerUserId: null,
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
  }, { timeout: CABINET_DELETION_TX_TIMEOUT_MS });

  // FIX-CABINET-ROLE-LEFTOVER: снимаем роль STUDIO у всех, кто потерял с этой
  // студией последнюю связь. Иначе «Кабинет студии» остаётся висеть в бургер-
  // меню и ведёт на несуществующий кабинет — меню строится из `roles`, а не из
  // наличия студии (`getAvailableCabinets`). Проверка ПОСЛЕ удаления и
  // по-человечно: мастер, состоящий ещё в одной студии, роль сохраняет.
  //
  // Роль снимается ПОСЛЕ коммита и не в транзакции: это не часть целостности
  // данных, а состояние навигации, и провал здесь не должен откатывать
  // удаление. При провале пользователь увидит лишний пункт меню — тот же
  // симптом, что и раньше, а не потерянную студию.
  for (const memberId of result.memberUserIds) {
    try {
      if (await hasAnyStudioAffiliation(memberId)) continue;
      await removeProfessionalRoles(memberId, [
        AccountType.STUDIO,
        AccountType.STUDIO_ADMIN,
      ]);
    } catch (error) {
      logError("Failed to drop studio role after studio deletion", {
        userId: memberId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const title = "Студия расформирована";
  const body = `Студия «${result.studioName}» расформирована. Кабинет студии больше недоступен.`;

  for (const memberId of result.memberUserIds) {
    // Удаление аккаунта: самому удаляемому уведомление не шлём.
    if (options.silent && memberId === userId) continue;
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
