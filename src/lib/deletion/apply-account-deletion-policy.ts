import "server-only";

import type { Prisma } from "@prisma/client";

import {
  CLIENT_BOOKING_NOT_ANONYMIZED,
  anonymizeClientBookingsTx,
  anonymizeClientChatMessagesTx,
  anonymizeModelApplicationsTx,
  collectPolicyMedia,
  deleteAuthoredReviewsTx,
  deleteClientCardsTx,
  deleteClientNotesTx,
  deleteConsentsTx,
  deleteNotificationsTx,
} from "@/lib/deletion/account-deletion-actions";
import {
  ACCOUNT_DELETION_POLICY,
  MEDIA_KIND_POLICY_RELATION,
  actsAtDeletion,
  deferredCutoff,
  deferredMonths,
  type AccountDeletionPolicy,
  type PolicyMediaKind,
} from "@/lib/deletion/account-deletion-policy";
import { enqueueMediaPurge } from "@/lib/deletion/enqueue-media-purge";
import { logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** Прежнее поведение уведомлений при `KEEP`: удалялись только старше 30 дней. */
const LEGACY_NOTIFICATION_RETENTION_DAYS = 30;

export type AccountDeletionOptions = {
  /** Галочка «Удалить и мои отзывы» — действует только при `USER_CHOICE`. */
  deleteReviews?: boolean;
};

/** Виды медиа, которые уходят в момент удаления аккаунта. */
export function mediaKindsAtDeletion(policy: AccountDeletionPolicy = ACCOUNT_DELETION_POLICY): PolicyMediaKind[] {
  return (Object.keys(MEDIA_KIND_POLICY_RELATION) as PolicyMediaKind[]).filter((kind) =>
    actsAtDeletion(policy[MEDIA_KIND_POLICY_RELATION[kind]]),
  );
}

/** Отзывы удаляются при удалении аккаунта: всегда (`DELETE`) или по галочке (`USER_CHOICE`). */
export function deletesReviewsAtDeletion(
  options: AccountDeletionOptions,
  policy: AccountDeletionPolicy = ACCOUNT_DELETION_POLICY,
): boolean {
  const action = policy.reviewsAuthored;
  return action.kind === "DELETE" || (action.kind === "USER_CHOICE" && options.deleteReviews === true);
}

/**
 * Действия политики в транзакции удаления аккаунта. Отложенные (`*_AFTER`)
 * здесь не выполняются — их делает `runDeferredAccountDeletionPolicy`.
 */
export async function applyPolicyAtDeletionTx(
  tx: Tx,
  userId: string,
  options: AccountDeletionOptions = {},
  policy: AccountDeletionPolicy = ACCOUNT_DELETION_POLICY,
  now: Date = new Date(),
): Promise<void> {
  const ids = [userId];
  if (policy.notifications.kind === "DELETE") {
    await deleteNotificationsTx(tx, ids);
  } else {
    const cutoff = new Date(now.getTime() - LEGACY_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await tx.notification.deleteMany({ where: { userId, createdAt: { lt: cutoff } } });
  }
  if (policy.bookings.kind === "ANONYMIZE_NOW") await anonymizeClientBookingsTx(tx, ids);
  if (policy.modelApplications.kind === "ANONYMIZE_NOW") await anonymizeModelApplicationsTx(tx, ids);
  if (policy.chatMessages.kind === "ANONYMIZE_NOW") await anonymizeClientChatMessagesTx(tx, ids);
  if (policy.clientCards.kind === "DELETE") await deleteClientCardsTx(tx, ids);
  if (policy.clientNotes.kind === "DELETE") await deleteClientNotesTx(tx, ids);
  if (deletesReviewsAtDeletion(options, policy)) await deleteAuthoredReviewsTx(tx, ids);
}

const DEFERRED_BATCH = 200;

/**
 * Отложенные действия (`ANONYMIZE_AFTER` / `DELETE_AFTER`): раз в сутки воркер
 * берёт людей, удалённых раньше срока, у которых ещё осталось что вычищать, —
 * пачками по 200, каждая пачка в своей транзакции. Повторный прогон ничего не
 * меняет: кандидат выбирается по «осталось», а действия идемпотентны.
 *
 * Пока в политике нет отложенных действий, проход ничего не читает.
 */
export async function runDeferredAccountDeletionPolicy(
  now: Date = new Date(),
  policy: AccountDeletionPolicy = ACCOUNT_DELETION_POLICY,
): Promise<{ bookingsAnonymized: number; consentsDeleted: number }> {
  const summary = { bookingsAnonymized: 0, consentsDeleted: 0 };

  const bookingMonths = deferredMonths(policy.bookings);
  if (bookingMonths !== null) {
    const cutoff = deferredCutoff(now, bookingMonths);
    const kinds = (Object.keys(MEDIA_KIND_POLICY_RELATION) as PolicyMediaKind[]).filter(
      (kind) => MEDIA_KIND_POLICY_RELATION[kind] === "bookings",
    );
    for (;;) {
      const users = await prisma.userProfile.findMany({
        where: {
          isDeleted: true,
          deletedAt: { lt: cutoff },
          bookings: { some: CLIENT_BOOKING_NOT_ANONYMIZED },
        },
        select: { id: true },
        take: DEFERRED_BATCH,
      });
      if (users.length === 0) break;
      const ids = users.map((user) => user.id);
      const media = await collectPolicyMedia(prisma, ids, kinds);
      const count = await prisma.$transaction((tx) => anonymizeClientBookingsTx(tx, ids));
      summary.bookingsAnonymized += count;
      await enqueueMediaPurge(media, "account-deletion", null);
      // Страховка: пачка без изменений значит, что отбор и действие разошлись.
      if (count === 0 || users.length < DEFERRED_BATCH) break;
    }
  }

  const consentMonths = deferredMonths(policy.consents);
  if (consentMonths !== null) {
    const cutoff = deferredCutoff(now, consentMonths);
    for (;;) {
      const users = await prisma.userProfile.findMany({
        where: { isDeleted: true, deletedAt: { lt: cutoff }, consents: { some: {} } },
        select: { id: true },
        take: DEFERRED_BATCH,
      });
      if (users.length === 0) break;
      const ids = users.map((user) => user.id);
      const count = await prisma.$transaction((tx) => deleteConsentsTx(tx, ids));
      summary.consentsDeleted += count;
      if (count === 0 || users.length < DEFERRED_BATCH) break;
    }
  }

  if (summary.bookingsAnonymized > 0 || summary.consentsDeleted > 0) {
    logInfo("deletion.deferredPolicy.done", summary);
  }
  return summary;
}
