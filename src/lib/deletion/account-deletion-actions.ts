import "server-only";

import { ChatSenderType, MediaEntityType, MediaKind, type Prisma } from "@prisma/client";

import { deleteConsentsOfDeletedUsersTx } from "@/lib/legal/consent";
import { recalculateTargetRatings } from "@/lib/reviews/recalculate-ratings";
import * as UI_TEXT from "@/lib/ui/text";
import type { PolicyMediaKind } from "@/lib/deletion/account-deletion-policy";

/**
 * 29.09 доработки · 26 (RKN-FIX-03-B) — действия политики удаления аккаунта
 * (`account-deletion-policy.ts`). Каждая функция берёт клиент транзакции и
 * НАБОР удалённых пользователей: её зовут и удаление аккаунта (один человек, в
 * его транзакции), и суточный отложенный проход (пачка людей, удалённых больше
 * N месяцев назад). Все идемпотентны: повторный прогон ничего не меняет —
 * условие «ещё не вычищено» стоит в `where` самой записи.
 *
 * Пока политика `KEEP`, ни одна из них не вызывается (кроме уведомлений —
 * решение 26.2). Они написаны и покрыты тестами заранее, чтобы решение юриста
 * включалось правкой одной константы, а не разработкой.
 */

type Tx = Prisma.TransactionClient;

const DELETED_NAME = UI_TEXT.deletion.deletedUserName;
const DELETED_MESSAGE = UI_TEXT.deletion.deletedMessageBody;

/**
 * «В записи ещё есть ПДн клиента». Одно условие на действие и на отбор
 * кандидатов отложенного прохода: разойдись они — проход выбирал бы людей,
 * которых действие не меняет, и крутился бы на них вечно.
 */
export const CLIENT_BOOKING_NOT_ANONYMIZED = {
  OR: [
    { clientName: { not: DELETED_NAME } },
    { clientPhone: { not: "" } },
    { clientNameSnapshot: { not: null } },
    { clientPhoneSnapshot: { not: null } },
    { comment: { not: null } },
    { referencePhotoAssetId: { not: null } },
  ],
} satisfies Prisma.BookingWhereInput;

/**
 * Ю26.1 — записи остаются (время, услуга, цена, статус: выручке и аналитике
 * мастера личность не нужна), ПДн клиента из них вычищаются: имя → заглушка,
 * телефон → пустая строка (колонка NOT NULL), снимки и комментарий клиента →
 * null, фото-референс отвязывается (сам файл удаляет очередь `media.purge`).
 *
 * ⚠️ Пустой телефон не склеивает удалённых в одного клиента CRM: `clientUserId`
 * у записи остаётся, а ключ клиента — `user:<id>` раньше телефона
 * (`crm/clients.ts`, `master/clients-view.service.ts`); поиск по телефону для
 * пустой строки вариантов не строит (`buildPhoneVariantsForMatch`).
 */
export async function anonymizeClientBookingsTx(tx: Tx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const { count } = await tx.booking.updateMany({
    where: { clientUserId: { in: [...userIds] }, ...CLIENT_BOOKING_NOT_ANONYMIZED },
    data: {
      clientName: DELETED_NAME,
      clientPhone: "",
      clientNameSnapshot: null,
      clientPhoneSnapshot: null,
      comment: null,
      referencePhotoAssetId: null,
    },
  });
  return count;
}

/**
 * Следует за Ю26.1: отклик без брони — переписка, которой больше не с кем
 * вести, удаляется; отклик, ставший записью, остаётся без заметки клиента
 * (фото удаляет очередь).
 */
export async function anonymizeModelApplicationsTx(
  tx: Tx,
  userIds: readonly string[],
): Promise<{ deleted: number; anonymized: number }> {
  if (userIds.length === 0) return { deleted: 0, anonymized: 0 };
  const removed = await tx.modelApplication.deleteMany({
    where: { clientUserId: { in: [...userIds] }, bookingId: null },
  });
  const cleared = await tx.modelApplication.updateMany({
    where: { clientUserId: { in: [...userIds] }, bookingId: { not: null }, clientNote: { not: null } },
    data: { clientNote: null },
  });
  return { deleted: removed.count, anonymized: cleared.count };
}

/**
 * Ю26.5 — сообщения клиента в переписке по его записям: текст →
 * «Сообщение удалено», имя отправителя → заглушка, вложение отвязывается.
 * Сообщения мастера и системные не трогаются — это не данные клиента.
 */
export async function anonymizeClientChatMessagesTx(tx: Tx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const { count } = await tx.chatMessage.updateMany({
    where: {
      senderType: ChatSenderType.CLIENT,
      chat: { booking: { clientUserId: { in: [...userIds] } } },
      OR: [
        { body: { not: DELETED_MESSAGE } },
        { senderName: { not: DELETED_NAME } },
        { attachmentMediaAssetId: { not: null } },
      ],
    },
    data: { body: DELETED_MESSAGE, senderName: DELETED_NAME, attachmentMediaAssetId: null },
  });
  return count;
}

/** Ю26.4 — карточки мастера о клиенте; строки фото уходят каскадом, файлы — очередью. */
export async function deleteClientCardsTx(tx: Tx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const { count } = await tx.clientCard.deleteMany({ where: { clientUserId: { in: [...userIds] } } });
  return count;
}

/** Ю26.4 — заметки мастера о клиенте. */
export async function deleteClientNotesTx(tx: Tx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const { count } = await tx.clientNote.deleteMany({ where: { clientUserId: { in: [...userIds] } } });
  return count;
}

/**
 * Ю26.2 — история согласий (с IP и User-Agent) после срока хранения. Сама
 * запись — в единственном писателе согласий (инв. #37).
 */
export async function deleteConsentsTx(tx: Tx, userIds: readonly string[]): Promise<number> {
  return deleteConsentsOfDeletedUsersTx(tx, userIds);
}

/** Решение 26.2 — уведомления удалённого: читать их некому. */
export async function deleteNotificationsTx(tx: Tx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const { count } = await tx.notification.deleteMany({ where: { userId: { in: [...userIds] } } });
  return count;
}

/**
 * Ю26.3 — отзывы автора удаляются (теги — каскадом), рейтинг каждой цели
 * пересчитывает единственный писатель (LOGIC-16). Цели — в порядке `targetId`:
 * пересчёт берёт `FOR UPDATE` на строке провайдера, и одинаковый порядок у
 * параллельных удалений исключает взаимную блокировку. Пересчитываются цели
 * только АКТИВНЫХ отзывов — снятый модерацией в рейтинг и так не входил.
 */
export async function deleteAuthoredReviewsTx(tx: Tx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const reviews = await tx.review.findMany({
    where: { authorId: { in: [...userIds] } },
    select: { targetType: true, targetId: true, masterId: true, deletedAt: true },
  });
  if (reviews.length === 0) return 0;
  const { count } = await tx.review.deleteMany({ where: { authorId: { in: [...userIds] } } });
  const targets = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    if (review.deletedAt) continue;
    targets.set(`${review.targetType}:${review.targetId}:${review.masterId ?? ""}`, review);
  }
  const ordered = [...targets.values()].sort((a, b) => a.targetId.localeCompare(b.targetId));
  for (const target of ordered) {
    await recalculateTargetRatings(tx, {
      targetType: target.targetType,
      targetId: target.targetId,
      masterId: target.masterId,
    });
  }
  return count;
}

type AssetRef = { id: string; storageKey: string };
type MediaReader = Pick<Tx, "mediaAsset" | "modelApplication">;

/**
 * Снимок медиа, которое уходит вместе со связями политики. Берётся ДО
 * транзакции (как `collectAccountMedia`): после неё указателей на объекты уже
 * не найти. Каждый вид — через свою связь: фото карточки загружает МАСТЕР,
 * референс привязан к брони, вложение — к сообщению, поэтому `createdByUserId`
 * удалённого здесь не помогает (`purge.ts` берёт по нему только аватар).
 */
export async function collectPolicyMedia(
  db: MediaReader,
  userIds: readonly string[],
  kinds: readonly PolicyMediaKind[],
): Promise<AssetRef[]> {
  if (userIds.length === 0 || kinds.length === 0) return [];
  const ids = [...userIds];
  const or: Prisma.MediaAssetWhereInput[] = [];
  if (kinds.includes(MediaKind.CLIENT_CARD_PHOTO)) {
    or.push({ kind: MediaKind.CLIENT_CARD_PHOTO, clientCardPhotos: { some: { card: { clientUserId: { in: ids } } } } });
  }
  if (kinds.includes(MediaKind.BOOKING_REFERENCE)) {
    or.push({ kind: MediaKind.BOOKING_REFERENCE, bookingReferences: { some: { clientUserId: { in: ids } } } });
  }
  if (kinds.includes(MediaKind.CHAT_ATTACHMENT)) {
    or.push({
      kind: MediaKind.CHAT_ATTACHMENT,
      chatMessageAttachments: {
        some: { senderType: ChatSenderType.CLIENT, chat: { booking: { clientUserId: { in: ids } } } },
      },
    });
  }
  if (kinds.includes(MediaKind.MODEL_APPLICATION_PHOTO)) {
    const applications = await db.modelApplication.findMany({
      where: { clientUserId: { in: ids } },
      select: { id: true },
    });
    if (applications.length > 0) {
      or.push({
        kind: MediaKind.MODEL_APPLICATION_PHOTO,
        entityType: MediaEntityType.MODEL_APPLICATION,
        entityId: { in: applications.map((application) => application.id) },
      });
    }
  }
  if (or.length === 0) return [];
  return db.mediaAsset.findMany({
    where: { deletedAt: null, OR: or },
    select: { id: true, storageKey: true },
  });
}
