import { type Prisma, AccountType, NotificationType, ProviderType, StudioMemberRole, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { removeProfessionalRoles } from "@/lib/auth/roles";
import { MediaEntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { collectProviderMedia } from "@/lib/media/purge";
import { enqueueMediaPurge } from "@/lib/deletion/enqueue-media-purge";
import { deliverNotification } from "@/lib/notifications/delivery";
import { logError, logInfo } from "@/lib/logging/logger";
import { countBlockingMasterBookings } from "@/lib/deletion/active-bookings";

type MasterDeletionResult = {
  providerId: string;
  providerName: string;
};

export type CabinetDeletionOptions = {
  /**
   * Удаление аккаунта целиком: уведомление «кабинет удалён» адресату, который
   * через мгновение перестанет существовать, не шлётся.
   */
  silent?: boolean;
};

/** Интерактивная транзакция удаления — два десятка операций; дефолтных 5 с мало. */
export const CABINET_DELETION_TX_TIMEOUT_MS = 30_000;

type MasterDeletionDb = Pick<Prisma.TransactionClient, "provider" | "booking">;

/**
 * Живые записи, которые останавливают удаление кабинета мастера. Профили
 * мастера в студиях — того же человека, без `MasterProfile` (STUDIO-MASTER-
 * PROFILES, этап 4): кабинет удаляется целиком, иначе профиль в студии
 * оставался бы активным и принимал записи от имени удалённого мастера.
 */
async function assertNoBlockingMasterBookings(db: MasterDeletionDb, userId: string, providerId: string) {
  const studioProfiles = await db.provider.findMany({
    where: { ownerUserId: userId, type: ProviderType.MASTER, masterProfile: { is: null } },
    select: { id: true },
  });
  // DELETION-03: общий предикат живой записи (включая CHANGE_REQUESTED/PREPAID/STARTED).
  let activeCount = await countBlockingMasterBookings(db, providerId);
  for (const studioProfile of studioProfiles) {
    activeCount += await countBlockingMasterBookings(db, studioProfile.id);
  }
  if (activeCount > 0) {
    throw new AppError("Есть активные записи", 409, "ACTIVE_BOOKINGS", { count: activeCount });
  }
  return { studioProfiles };
}

/**
 * DELETE-CABINET-REFUSAL-RATE-LIMIT — предпроверка для роута, ДО лимита
 * частоты (`destructiveDelete`, 1 в час): отказ ничего не разрушает, и тратить
 * на него единственную попытку значило бы запереть на час владельца, который
 * по подсказке закрыл записи и повторил. Та же проверка повторяется в
 * транзакции удаления — гонку с новой записью предпроверка не закрывает.
 */
export async function assertMasterCabinetDeletable(userId: string): Promise<void> {
  const masterProfile = await prisma.masterProfile.findUnique({
    where: { userId },
    select: { providerId: true },
  });
  if (!masterProfile) return;
  await assertNoBlockingMasterBookings(prisma, userId, masterProfile.providerId);
}

export async function deleteMasterCabinet(userId: string, options: CabinetDeletionOptions = {}): Promise<void> {
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
    const { studioProfiles } = await assertNoBlockingMasterBookings(tx, userId, providerId);

    await Promise.all([
      // DELETION-02 (PROVIDER-DANGLING-ROWS): каскад НЕ сработает — строка
      // Provider переживает удаление кабинета, поэтому чистим явно.
      tx.hotSlotSubscription.deleteMany({ where: { providerId } }),
      tx.userFavorite.deleteMany({ where: { providerId } }),
      tx.discountRule.deleteMany({ where: { providerId } }),
      tx.portfolioItem.deleteMany({ where: { masterId: providerId } }),
      // STUDIO-PORTFOLIO-FEED: фото студии, подписанные этим мастером, остаются у
      // студии — снимается только подпись исполнителя.
      tx.portfolioItem.updateMany({ where: { performerId: providerId }, data: { performerId: null } }),
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
      // SCHEDULE-PATTERNS-01: график — строго до шаблонов (позиции графика
      // держат шаблон через RESTRICT), поэтому цепочкой, а не рядом в `all`.
      tx.schedulePattern
        .deleteMany({ where: { providerId } })
        .then(() => tx.scheduleTemplate.deleteMany({ where: { providerId } })),
      tx.scheduleChangeRequest.deleteMany({ where: { providerId } }),
      tx.masterService.deleteMany({ where: { masterProviderId: providerId } }),
      tx.clientNote.deleteMany({ where: { masterId: providerId } }),
      tx.clientCard.deleteMany({ where: { providerId } }),
      // DELETION-03: пакеты услуг значились в карте диспозиций как DELETED, но
      // не удалялись; брони пакета остаются (BookingPackage.servicePackage → SetNull).
      tx.servicePackage.deleteMany({ where: { masterId: providerId } }),
      // DELETION-03: из студий уходит только роль МАСТЕРА. Раньше удалялись ВСЕ
      // членства пользователя — владелец студии, удаливший свой кабинет мастера,
      // терял OWNER-членство и доступ к собственной студии (/403).
      tx.studioMember.deleteMany({ where: { userId, role: StudioMemberRole.MASTER } }),
      tx.publicUsernameAlias.deleteMany({ where: { providerId } }),
      tx.service.deleteMany({
        where: {
          providerId,
          bookings: { none: {} },
        },
      }),
    ]);

    // Отзывы, НАПИСАННЫЕ пользователем как клиентом, кабинету не принадлежат и
    // здесь не трогаются (DELETION-03): раньше они удалялись без пересчёта
    // рейтинга чужих мастеров — рейтинги оставались протухшими.

    const memberships = await tx.studioMembership.findMany({
      where: { userId, roles: { has: StudioRole.MASTER } },
      select: { id: true, roles: true },
    });
    for (const membership of memberships) {
      const rest = membership.roles.filter((role) => role !== StudioRole.MASTER);
      if (rest.length === 0) {
        await tx.studioMembership.delete({ where: { id: membership.id } });
      } else {
        await tx.studioMembership.update({ where: { id: membership.id }, data: { roles: rest } });
      }
    }

    // Услуги с историей броней остаются (FK), но продаваться не должны.
    await tx.service.updateMany({ where: { providerId }, data: { isActive: false } });

    // DELETION-03: платная подписка кабинета больше не продлевается сама —
    // иначе удалённый кабинет продолжал бы списывать деньги с сохранённой карты.
    await tx.userSubscription.updateMany({
      where: { userId, scope: "MASTER", autoRenew: true },
      data: { autoRenew: false, cancelAtPeriodEnd: true, nextBillingAt: null },
    });

    await tx.provider.update({
      where: { id: providerId },
      data: {
        // DELETION-03: связь с владельцем рвётся (так и записано в карте
        // диспозиций). Без этого повторное создание кабинета подхватывало
        // анонимизированную строку вместе со старыми услугами и историей.
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
        studioId: null,
        studioPaused: false,
      },
    });

    // STUDIO-MASTER-PROFILES: профили в студиях — та же чистка, что у личного,
    // по отношениям, которые у профиля в студии бывают (услуг, пакетов,
    // портфолио и страницы у него нет); строка остаётся ради истории записей
    // студии, но без владельца и вне студии.
    for (const studioProfile of studioProfiles) {
      const studioProfileId = studioProfile.id;
      await Promise.all([
        tx.masterService.deleteMany({ where: { masterProviderId: studioProfileId } }),
        tx.timeBlock.deleteMany({ where: { masterId: studioProfileId } }),
        tx.scheduleOverride.deleteMany({ where: { providerId: studioProfileId } }),
        tx.scheduleBreak.deleteMany({ where: { providerId: studioProfileId } }),
        tx.weeklyScheduleConfig.deleteMany({ where: { providerId: studioProfileId } }),
        tx.schedulePattern
          .deleteMany({ where: { providerId: studioProfileId } })
          .then(() => tx.scheduleTemplate.deleteMany({ where: { providerId: studioProfileId } })),
        tx.scheduleChangeRequest.deleteMany({ where: { providerId: studioProfileId } }),
        tx.discountRule.deleteMany({ where: { providerId: studioProfileId } }),
        tx.hotSlot.deleteMany({ where: { providerId: studioProfileId } }),
        tx.modelOffer.deleteMany({ where: { masterId: studioProfileId } }),
        tx.portfolioItem.updateMany({
          where: { performerId: studioProfileId },
          data: { performerId: null },
        }),
      ]);
      await tx.provider.update({
        where: { id: studioProfileId },
        data: {
          ownerUserId: null,
          isPublished: false,
          avatarUrl: null,
          description: null,
          studioId: null,
          studioPaused: false,
        },
      });
    }

    await tx.masterProfile.delete({ where: { id: masterProfile.id } });

    return {
      providerId,
      providerName: masterProfile.provider?.name || "Мастер",
    };
  }, { timeout: CABINET_DELETION_TX_TIMEOUT_MS });

  // FIX-CABINET-ROLE-LEFTOVER: зеркало студийного пути — без снятия роли пункт
  // «Кабинет мастера» остаётся в меню и ведёт в удалённый кабинет. `MasterProfile`
  // к этому моменту удалён, других оснований у роли нет.
  try {
    await removeProfessionalRoles(userId, [AccountType.MASTER]);
  } catch (error) {
    logError("Failed to drop master role after cabinet deletion", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const title = "Кабинет мастера удалён";
  const body = "Ваш кабинет мастера удалён. Услуги, расписание и портфолио удалены.";

  if (!options.silent) {
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
  }

  await enqueueMediaPurge(mediaToPurge, "master-cabinet-deletion", userId);

  logInfo("Master cabinet deleted", { userId });
}
