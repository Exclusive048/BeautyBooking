import { MembershipStatus } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { collectAccountMedia } from "@/lib/media/purge";
import { enqueueMediaPurge } from "@/lib/deletion/enqueue-media-purge";
import { alertWarning } from "@/lib/monitoring";
import { deleteMasterCabinet } from "@/lib/deletion/delete-master";
import { deleteStudioCabinet, ownedStudioWhere } from "@/lib/deletion/delete-studio";
import {
  countBlockingClientBookings,
  countBlockingMasterBookings,
  countBlockingStudioBookings,
} from "@/lib/deletion/active-bookings";
import { collectPolicyMedia } from "@/lib/deletion/account-deletion-actions";
import {
  applyPolicyAtDeletionTx,
  mediaKindsAtDeletion,
  type AccountDeletionOptions,
} from "@/lib/deletion/apply-account-deletion-policy";
import { discardStagedMaster, findPendingInvitesAddressedTo } from "@/lib/invites/service";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * Живые записи, которые останавливают удаление аккаунта: во всех кабинетах
 * человека (DELETION-03) и его собственные предстоящие визиты (решение 26.1).
 * Отдельной функцией, потому что роут зовёт её ДО лимита частоты: отказ ничего
 * не разрушает, и расходовать на него единственную попытку в час
 * (`destructiveDelete`) значило бы запереть человека, который отменил записи и
 * повторил, на час с «Слишком часто».
 */
export async function assertAccountDeletable(userId: string) {
  const masterProfile = await prisma.masterProfile.findUnique({
    where: { userId },
    select: { id: true, providerId: true },
  });
  const ownedStudios = await prisma.studio.findMany({
    where: ownedStudioWhere(userId),
    select: { id: true, providerId: true },
  });

  // DELETION-03: живые записи проверяются во ВСЕХ кабинетах ДО первого
  // удаления. Раньше кабинет мастера удалялся своей транзакцией, а 409 от
  // студии прилетал уже после — аккаунт оставался с удалённым кабинетом
  // мастера и не удалённым сам.
  let blocking = masterProfile ? await countBlockingMasterBookings(prisma, masterProfile.providerId) : 0;
  for (const studio of ownedStudios) {
    blocking += await countBlockingStudioBookings(prisma, studio);
  }
  if (blocking > 0) {
    throw new AppError("Есть активные записи", 409, "ACTIVE_BOOKINGS", { count: blocking });
  }
  // 29.09 доработки · 26 (решение 26.1): и предстоящие записи самого клиента —
  // мастер не должен ждать человека, которого нет.
  const clientBlocking = await countBlockingClientBookings(prisma, userId);
  if (clientBlocking > 0) {
    throw new AppError(
      UI_TEXT.deletion.accountClientBookings(clientBlocking),
      409,
      "CLIENT_ACTIVE_BOOKINGS",
      { count: clientBlocking },
    );
  }

  return { masterProfile, ownedStudios };
}

export async function deleteUserAccount(userId: string, options: AccountDeletionOptions = {}): Promise<void> {
  const user = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      phoneVerifiedAt: true,
      email: true,
      emailVerifiedAt: true,
    },
  });

  if (!user) {
    throw new AppError("Пользователь не найден", 404, "NOT_FOUND");
  }

  const { masterProfile, ownedStudios } = await assertAccountDeletable(userId);

  if (masterProfile) {
    await deleteMasterCabinet(userId, { silent: true });
  }

  for (let guard = 0; guard < ownedStudios.length + 1; guard += 1) {
    const studio = await prisma.studio.findFirst({ where: ownedStudioWhere(userId), select: { id: true } });
    if (!studio) break;
    await deleteStudioCabinet(userId, { silent: true });
  }

  const now = new Date();

  // DELETION-02: снимок медиа делается ДО транзакции — иначе к моменту enqueue
  // указателей на объекты в бакете может уже не быть. Сам enqueue — ПОСЛЕ
  // коммита (ниже): очередь не участвует в транзакции, и поставить задачу на
  // удаление байтов раньше, чем удаление данных зафиксировано, значило бы
  // рискнуть удалить объекты у откатившегося удаления. 29.09 доработки · 26:
  // плюс медиа связей, которые политика удаления вычищает сразу (пока — ничего).
  const mediaToPurge = [
    ...(await collectAccountMedia(userId)),
    ...(await collectPolicyMedia(prisma, [userId], mediaKindsAtDeletion())),
  ];

  // 29.09 доработки · 26: неотвеченные приглашения в студию на ПОДТВЕРЖДЁННЫЙ
  // телефон или почту человека несут его контакт и ему больше не нужны.
  // Строки — в транзакции, заготовки мастера под них (с фото) — после неё.
  const invites = await findPendingInvitesAddressedTo({
    phone: user.phone,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
  });

  await prisma.$transaction(async (tx) => {
    // Коды входа — и по телефону, и по почте (раньше только по телефону).
    // Почта — только подтверждённая: неподтверждённый адрес мог быть чужим, и
    // удалять по нему значило бы гасить чужой код входа. Прочее подберёт
    // фоновая чистка просроченных кодов (`auth/otp-cleanup.ts`).
    const otpOwners = [
      ...(user.phone ? [{ phone: user.phone }] : []),
      ...(user.email && user.emailVerifiedAt ? [{ email: user.email.trim().toLowerCase() }] : []),
    ];
    if (otpOwners.length > 0) {
      await tx.otpCode.deleteMany({ where: { OR: otpOwners } });
    }

    // RKN-FIX-03-A: what this list covers (and, just as importantly, what it
    // deliberately doesn't) is declared in `user-data-disposition.ts` and
    // enforced by a DMMF-driven test — the previous hand-maintained list went
    // stale silently when new relations were added.
    await Promise.all([
      tx.pushSubscription.deleteMany({ where: { userId } }),
      // MOBILE-B2: push-токены приложения — удалённому аккаунту push не уходит.
      tx.mobilePushDevice.deleteMany({ where: { userId } }),
      tx.telegramLinkToken.deleteMany({ where: { userId } }),
      tx.telegramLink.deleteMany({ where: { userId } }),
      tx.vkLink.deleteMany({ where: { userId } }),
      // The gap this fix was filed for: Yandex OAuth shipped after this list was
      // written, so the link — with its plaintext access/refresh tokens and the
      // `yandexUserId` the account can be re-identified by — outlived deletion.
      tx.yandexLink.deleteMany({ where: { userId } }),
      tx.publicUsernameAlias.deleteMany({ where: { clientUserId: userId } }),
      tx.favorite.deleteMany({ where: { userId } }),
      // Same decay, newer twin: catalog hearts were added after `favorite` and
      // never joined the list.
      tx.userFavorite.deleteMany({ where: { userId } }),
      // Left behind, these kept `notifyHotSlotSubscribers` writing notification
      // rows to a deleted account indefinitely.
      tx.hotSlotSubscription.deleteMany({ where: { userId } }),
      // Cleaned by `delete-master` only — so a studio ADMIN with no master
      // cabinet stayed an ACTIVE member of a live studio after deleting.
      tx.studioMembership.deleteMany({ where: { userId } }),
      tx.studioMember.deleteMany({ where: { userId } }),
      // Terminate every session explicitly. Revoked rather than deleted: the
      // rows hold no PD, revocation is what actually ends access, and the
      // surviving row keeps the "was an account" marker that
      // `isGuestClassProfile` (RKN-FIX-02) reads. Session RESOLUTION already
      // refuses a deleted profile (`isDeleted: false` in session.ts), so this
      // closes the window rather than opening one.
      tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    // 29.09 доработки · 26: связи, судьбу которых решает политика удаления
    // (`account-deletion-policy.ts`): уведомления — все (решение 26.2), прочее —
    // как сейчас, пока юрист не ответил.
    await applyPolicyAtDeletionTx(tx, userId, options, undefined, now);

    if (invites.inviteIds.length > 0) {
      await tx.studioInvite.deleteMany({
        where: { id: { in: invites.inviteIds }, status: MembershipStatus.PENDING },
      });
    }

    const subscriptions = await tx.userSubscription.findMany({
      where: { userId },
      select: { id: true, _count: { select: { payments: true } } },
    });
    const deletableIds = subscriptions
      .filter((item) => item._count.payments === 0)
      .map((item) => item.id);
    if (deletableIds.length > 0) {
      await tx.userSubscription.deleteMany({ where: { id: { in: deletableIds } } });
    }
    // DELETION-03: подписки с платежами остаются (история платежей), но
    // продлеваться больше не могут: без этого крон продлений списывал бы
    // деньги с сохранённой карты удалённого аккаунта.
    const retainedIds = subscriptions
      .filter((item) => item._count.payments > 0)
      .map((item) => item.id);
    if (retainedIds.length > 0) {
      await tx.userSubscription.updateMany({
        where: { id: { in: retainedIds } },
        data: { autoRenew: false, cancelAtPeriodEnd: true, nextBillingAt: null, paymentMethodId: null },
      });
    }

    await tx.userProfile.update({
      where: { id: userId },
      data: {
        phone: null,
        // PHONE-CLAIM-01: вместе с номером уходит и отметка владения.
        phoneVerifiedAt: null,
        email: null,
        displayName: UI_TEXT.deletion.deletedUserName,
        telegramId: null,
        telegramUsername: null,
        externalPhotoUrl: null,
        firstName: null,
        lastName: null,
        middleName: null,
        birthDate: null,
        address: null,
        geoLat: null,
        geoLng: null,
        publicUsername: null,
        publicUsernameUpdatedAt: null,
        isDeleted: true,
        deletedAt: now,
      },
    });
  });

  // DELETION-02 — байты в хранилище удаляет воркер: операция сетевая, медленная
  // и требующая ретраев, а запрос пользователя на удаление не должен от неё
  // зависеть. Список ключей логируется здесь: удаление из S3 необратимо, и
  // «что именно было заявлено к удалению» должно остаться в аудите.
  await enqueueMediaPurge(mediaToPurge, "account-deletion", userId);

  // Заготовки мастера под удалённые приглашения: удаление аккаунта уже
  // состоялось, поэтому сбой здесь не откатывает его, но не молчит.
  for (const stagedMasterId of invites.stagedMasterIds) {
    try {
      await discardStagedMaster(stagedMasterId);
    } catch (error) {
      logError("Failed to discard staged master after account deletion", {
        stagedMasterId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logInfo("User account deleted", { userId });
  await alertWarning("User account deleted", { userId });
}
