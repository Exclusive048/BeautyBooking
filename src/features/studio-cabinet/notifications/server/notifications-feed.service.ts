import "server-only";

import { NotificationType, type Prisma } from "@prisma/client";
import {
  loadPendingScheduleRequestItems,
  mergeBookingPayload,
  type NotificationCenterNotificationItem,
} from "@/lib/notifications/center";
import { resolveStudioNotificationScope } from "@/lib/notifications/studio-feed";
import { prisma } from "@/lib/prisma";
import { classifyStudioChip } from "../lib/chip-classifier";
import { studioMobileNotificationLink } from "../lib/studio-mobile-link";
import type { StudioNotificationChip, StudioNotificationsChipCounts } from "../lib/types";

/**
 * MOBILE-STUDIO-C (ops) — лента уведомлений студии для приложения
 * (`GET /api/cabinet/studio/notifications`). Тот же набор, что веб-страница
 * (канал STUDIO центра + ожидающие заявки на смену графика), но постранично и
 * по всей истории, а не по 100 последним: канал — условием в базе
 * (`studioChannelNotificationWhere`).
 *
 * Виртуальный список: сначала заявки на смену графика (решения, новые сверху),
 * затем уведомления (новые сверху). Смещение — по этому списку.
 */

export type StudioFeedChip = StudioNotificationChip;
type BucketChip = Exclude<StudioNotificationChip, "all" | "unread">;

export type StudioFeedItem = {
  id: string;
  type: NotificationType | "SCHEDULE_REQUEST";
  chip: BucketChip;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  bookingId: string | null;
  needsDecision: boolean;
  link: string | null;
  payload: Record<string, unknown> | null;
};

export type StudioFeedPage = {
  chip: StudioFeedChip;
  unreadCount: number;
  needsDecisionCount: number;
  chipCounts: StudioNotificationsChipCounts;
  items: StudioFeedItem[];
  /** Всего элементов в выбранной вкладке — для «есть ещё». */
  total: number;
};

const ALL_TYPES = Object.values(NotificationType);

function typesOfChip(chip: BucketChip): NotificationType[] {
  return ALL_TYPES.filter((type) => classifyStudioChip(type) === chip);
}

function chipWhere(chip: StudioFeedChip): Prisma.NotificationWhereInput {
  if (chip === "all") return {};
  if (chip === "unread") return { isRead: false };
  return { type: { in: typesOfChip(chip) } };
}

/** Заявки на смену графика видны во «Все», «Непрочитанные» и «Команда». */
function chipShowsScheduleRequests(chip: StudioFeedChip): boolean {
  return chip === "all" || chip === "unread" || classifyStudioChip("SCHEDULE_REQUEST") === chip;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pseudoToItem(item: NotificationCenterNotificationItem): StudioFeedItem {
  return {
    id: item.id,
    type: item.type,
    chip: classifyStudioChip(item.type),
    title: item.title,
    body: item.body,
    isRead: item.isRead,
    readAt: item.readAt,
    createdAt: item.createdAt,
    bookingId: null,
    needsDecision: true,
    link: "/studio/schedule-requests",
    payload: null,
  };
}

export async function loadStudioNotificationFeed(input: {
  userId: string;
  studioId: string;
  chip: StudioFeedChip;
  offset: number;
  limit: number;
}): Promise<StudioFeedPage> {
  const scope = await resolveStudioNotificationScope(input.userId);
  const listWhere: Prisma.NotificationWhereInput = { AND: [scope.where, chipWhere(input.chip)] };

  const [pseudoAll, byType, unread, listTotal] = await Promise.all([
    loadPendingScheduleRequestItems(scope.adminStudioIds),
    prisma.notification.groupBy({ by: ["type"], where: scope.where, _count: { _all: true } }),
    prisma.notification.count({ where: { AND: [scope.where, { isRead: false }] } }),
    prisma.notification.count({ where: listWhere }),
  ]);

  const pseudo = chipShowsScheduleRequests(input.chip) ? pseudoAll : [];
  const pseudoPage = pseudo.slice(input.offset, input.offset + input.limit);
  const dbTake = input.limit - pseudoPage.length;
  const dbSkip = Math.max(0, input.offset - pseudo.length);

  const rows =
    dbTake > 0
      ? await prisma.notification.findMany({
          where: listWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: dbSkip,
          take: dbTake,
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            isRead: true,
            readAt: true,
            createdAt: true,
            payloadJson: true,
            bookingId: true,
            booking: {
              select: {
                id: true,
                status: true,
                studioId: true,
                startAtUtc: true,
                proposedStartAt: true,
                actionRequiredBy: true,
                provider: { select: { timezone: true } },
              },
            },
          },
        })
      : [];

  const chipCounts: StudioNotificationsChipCounts = {
    all: 0,
    unread: unread + pseudoAll.length,
    bookings: 0,
    cancellations: 0,
    reschedules: 0,
    reviews: 0,
    messages: 0,
    team: 0,
    finance: 0,
    system: 0,
  };
  for (const group of byType) {
    chipCounts[classifyStudioChip(group.type)] += group._count._all;
    chipCounts.all += group._count._all;
  }
  for (const item of pseudoAll) {
    chipCounts[classifyStudioChip(item.type)] += 1;
    chipCounts.all += 1;
  }

  const items: StudioFeedItem[] = [
    ...pseudoPage.map(pseudoToItem),
    ...rows.map((row) => {
      const bookingId = row.bookingId ?? row.booking?.id ?? null;
      return {
        id: row.id,
        type: row.type,
        chip: classifyStudioChip(row.type),
        title: row.title,
        body: row.body,
        isRead: row.isRead,
        readAt: row.readAt ? row.readAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        bookingId,
        needsDecision: false,
        link: studioMobileNotificationLink({
          type: row.type,
          bookingId,
          bookingStudioId: row.booking?.studioId ?? null,
          studioId: input.studioId,
        }),
        payload: asRecord(mergeBookingPayload(row.payloadJson, row.booking)),
      };
    }),
  ];

  return {
    chip: input.chip,
    unreadCount: unread + pseudoAll.length,
    needsDecisionCount: pseudoAll.length,
    chipCounts,
    items,
    total: pseudo.length + listTotal,
  };
}
