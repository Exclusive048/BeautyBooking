import { NotificationType, Prisma, ProviderType, ScheduleChangeRequestStatus } from "@prisma/client";
import {
  loadNotificationStudioAudience,
  resolveModelChannel,
  SCHEDULE_REQUEST_ITEMS_LIMIT,
} from "@/lib/notifications/center";
import { prisma } from "@/lib/prisma";

/**
 * MOBILE-STUDIO-C (ops) — канал STUDIO центра уведомлений условием Prisma.
 *
 * Веб-страница уведомлений студии берёт 100 последних уведомлений
 * пользователя и раскладывает их по каналам в памяти
 * (`getNotificationCenterData` → `channel === "STUDIO"`). Приложению нужны
 * постраничная лента, счётчик и «прочитать все» ТОЛЬКО для студии — то есть то
 * же правило, но в базе. Условие повторяет порядок классификации центра:
 *
 *  1. модельные типы (`resolveModelChannel`) — свой канал, в студию не попадают;
 *  2. `STUDIO_*` — всегда студия;
 *  3. остальные — по записи (`classifyNotificationChannel`): запись, которую
 *     пользователь выполняет сам (исполнитель или его личный профиль), —
 *     канал мастера; запись студии, где у него активное членство, или запись
 *     студии, которой он владеет, — студия; без записи — система.
 *
 * Совпадение с классификатором сторожит `studio-feed.test.ts`.
 */

/** Типы, которые центр всегда относит к студии. */
export const STUDIO_PREFIX_NOTIFICATION_TYPES: NotificationType[] = Object.values(NotificationType).filter((type) =>
  type.startsWith("STUDIO_"),
);

/** Модельные типы: канал задан типом (`resolveModelChannel`), не записью. */
export const MODEL_CHANNEL_NOTIFICATION_TYPES: NotificationType[] = Object.values(NotificationType).filter(
  (type) => resolveModelChannel(type) !== null,
);

export function studioChannelNotificationWhere(input: {
  userId: string;
  /** Студии с АКТИВНЫМ членством пользователя (`loadNotificationStudioAudience().studioIds`). */
  studioIds: string[];
}): Prisma.NotificationWhereInput {
  const { userId } = input;
  return {
    userId,
    deletedAt: null,
    OR: [
      { type: { in: STUDIO_PREFIX_NOTIFICATION_TYPES } },
      {
        type: { notIn: [...MODEL_CHANNEL_NOTIFICATION_TYPES, ...STUDIO_PREFIX_NOTIFICATION_TYPES] },
        booking: {
          is: {
            AND: [
              // не исполнитель записи (иначе канал мастера)
              {
                OR: [
                  { masterProviderId: null },
                  { masterProvider: { is: { ownerUserId: null } } },
                  { masterProvider: { is: { ownerUserId: { not: userId } } } },
                ],
              },
              // не запись на его личный профиль мастера
              {
                OR: [
                  { provider: { is: { type: { not: ProviderType.MASTER } } } },
                  { provider: { is: { ownerUserId: null } } },
                  { provider: { is: { ownerUserId: { not: userId } } } },
                ],
              },
              // запись его студии
              {
                OR: [
                  { studioId: { in: input.studioIds } },
                  { provider: { is: { type: ProviderType.STUDIO, ownerUserId: userId } } },
                ],
              },
            ],
          },
        },
      },
    ],
  };
}

export type StudioNotificationScope = {
  where: Prisma.NotificationWhereInput;
  /** Студии, где пользователь OWNER/ADMIN или владелец: их заявки на смену графика. */
  adminStudioIds: string[];
};

export async function resolveStudioNotificationScope(userId: string): Promise<StudioNotificationScope> {
  const audience = await loadNotificationStudioAudience(userId);
  return {
    where: studioChannelNotificationWhere({ userId, studioIds: Array.from(audience.studioIds) }),
    adminStudioIds: Array.from(audience.adminStudioIds),
  };
}

/** Число ожидающих заявок на смену графика — столько псевдо-уведомлений покажет лента. */
export async function countPendingScheduleRequestItems(adminStudioIds: string[]): Promise<number> {
  if (adminStudioIds.length === 0) return 0;
  const count = await prisma.scheduleChangeRequest.count({
    where: { studioId: { in: adminStudioIds }, status: ScheduleChangeRequestStatus.PENDING },
  });
  return Math.min(count, SCHEDULE_REQUEST_ITEMS_LIMIT);
}

export type StudioNotificationCounts = {
  /** Непрочитанные уведомления студии + ожидающие заявки на смену графика (как KPI веб-страницы). */
  unreadCount: number;
  /** Ожидающие заявки на смену графика. */
  needsDecisionCount: number;
};

export async function getStudioNotificationCounts(
  userId: string,
  scope?: StudioNotificationScope,
): Promise<StudioNotificationCounts> {
  const resolved = scope ?? (await resolveStudioNotificationScope(userId));
  const [unread, needsDecisionCount] = await Promise.all([
    prisma.notification.count({ where: { AND: [resolved.where, { isRead: false }] } }),
    countPendingScheduleRequestItems(resolved.adminStudioIds),
  ]);
  return { unreadCount: unread + needsDecisionCount, needsDecisionCount };
}

/**
 * «Прочитать все» только в канале студии: личные уведомления и уведомления
 * мастера остаются непрочитанными. Заявки на смену графика не трогаются — это
 * решения, а не уведомления.
 */
export async function markStudioNotificationsRead(
  userId: string,
  now: Date = new Date(),
): Promise<{ updated: number } & StudioNotificationCounts> {
  const scope = await resolveStudioNotificationScope(userId);
  const result = await prisma.notification.updateMany({
    where: { AND: [scope.where, { isRead: false }] },
    data: { isRead: true, readAt: now },
  });
  const counts = await getStudioNotificationCounts(userId, scope);
  return { updated: result.count, ...counts };
}
