import { MembershipStatus, NotificationType, ProviderType, StudioRole } from "@prisma/client";
import { pendingInvitesVisibleToUserWhere } from "@/lib/invites/access";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { resolveNotificationOpenHref } from "@/lib/notifications/presentation";
import { prisma } from "@/lib/prisma";

export type NotificationChannel = "MASTER" | "STUDIO" | "SYSTEM";

export type NotificationCenterInviteItem = {
  id: string;
  studioId: string;
  studioName: string;
  studioTagline: string | null;
  studioAvatarUrl: string | null;
  studioPublicUsername: string | null;
  createdAt: string;
};

export type NotificationCenterNotificationItem = {
  id: string;
  title: string;
  body: string;
  type: NotificationType | "SCHEDULE_REQUEST";
  channel: NotificationChannel;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  payloadJson: unknown | null;
  openHref?: string;
};

export type NotificationCenterData = {
  invites: NotificationCenterInviteItem[];
  notifications: NotificationCenterNotificationItem[];
  unreadCount: number;
  hasPhone: boolean;
};

export function classifyNotificationChannel(input: {
  userId: string;
  studioIds: Set<string>;
  booking: {
    studioId: string | null;
    provider: { type: ProviderType; ownerUserId: string | null };
    masterProvider: { ownerUserId: string | null } | null;
  } | null;
}): NotificationChannel {
  const booking = input.booking;
  if (!booking) return "SYSTEM";

  if (booking.masterProvider?.ownerUserId === input.userId) return "MASTER";

  if (booking.provider.type === ProviderType.MASTER && booking.provider.ownerUserId === input.userId) {
    return "MASTER";
  }

  if (booking.studioId && input.studioIds.has(booking.studioId)) return "STUDIO";

  if (booking.provider.type === ProviderType.STUDIO && booking.provider.ownerUserId === input.userId) {
    return "STUDIO";
  }

  return "SYSTEM";
}

function parseJsonPayload(payloadJson: unknown): unknown {
  if (typeof payloadJson === "string") {
    try {
      return JSON.parse(payloadJson) as unknown;
    } catch {
      return null;
    }
  }
  return payloadJson ?? null;
}

/**
 * RESCHEDULE-CURRENT-TIME (2026-09-15). Текст уведомления («… записался на
 * 10:00») заморожен в момент создания, а бронь живёт дальше: клиент оформил
 * запись и тут же перенёс её — мастер в центре уведомлений читал первую дату
 * как актуальную. Раньше из живой брони подтягивался только статус; теперь
 * ещё и АКТУАЛЬНОЕ время (`currentStartAtUtc` = предложение переноса, если
 * оно есть, иначе текущее начало) плюс зона салона для его отображения.
 * Сохранённый `startAtUtc` не трогается — по расхождению с ним страница и
 * понимает, что время сменилось.
 */
export function mergeBookingPayload(
  payloadJson: unknown,
  booking:
    | {
        id: string;
        status: string;
        startAtUtc: Date | null;
        proposedStartAt: Date | null;
        actionRequiredBy: string | null;
        provider: { timezone: string };
      }
    | null
    | undefined
): unknown {
  const parsed = parseJsonPayload(payloadJson);
  if (!booking) return parsed;

  const record = parsed && typeof parsed === "object" ? { ...(parsed as Record<string, unknown>) } : {};
  if (typeof record.bookingId !== "string" || record.bookingId.length === 0) {
    record.bookingId = booking.id;
  }
  record.bookingStatus = booking.status;
  record.actionRequiredBy = booking.actionRequiredBy ?? null;
  const current = booking.proposedStartAt ?? booking.startAtUtc;
  record.currentStartAtUtc = current ? current.toISOString() : null;
  if (typeof record.providerTimezone !== "string" || record.providerTimezone.length === 0) {
    record.providerTimezone = booking.provider.timezone;
  }
  return record;
}

function resolveModelOpenHref(type: NotificationCenterNotificationItem["type"], payloadJson: unknown): string | undefined {
  if (
    type !== "MODEL_NEW_APPLICATION" &&
    type !== "MODEL_APPLICATION_RECEIVED" &&
    type !== "MODEL_TIME_PROPOSED" &&
    type !== "MODEL_APPLICATION_REJECTED" &&
    type !== "MODEL_BOOKING_CREATED" &&
    type !== "MODEL_TIME_CONFIRMED"
  ) {
    return undefined;
  }
  const payload = parseJsonPayload(payloadJson);
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as { offerId?: unknown; applicationId?: unknown };
  if (type === "MODEL_TIME_PROPOSED" || type === "MODEL_APPLICATION_REJECTED") {
    if (typeof record.applicationId === "string" && record.applicationId.trim().length > 0) {
      return `/cabinet/model-applications?applicationId=${record.applicationId}`;
    }
  }
  if (typeof record.offerId === "string" && record.offerId.trim().length > 0) {
    // R2-06-C: the model-offers page reads `?filterOffer=`, not `?offerId=`.
    return `/cabinet/master/model-offers?filterOffer=${record.offerId}`;
  }
  return undefined;
}

function resolveChatOpenHref(type: NotificationCenterNotificationItem["type"], payloadJson: unknown): string | undefined {
  if (type !== "CHAT_MESSAGE_RECEIVED") return undefined;
  const payload = parseJsonPayload(payloadJson);
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as { bookingId?: unknown; senderType?: unknown };
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return undefined;
  const params = new URLSearchParams({ focus: record.bookingId, chat: "open" });
  if (record.senderType === "CLIENT") {
    return `/cabinet/master/dashboard?${params.toString()}`;
  }
  return `/cabinet/bookings?${params.toString()}`;
}

export function resolveModelChannel(type: NotificationCenterNotificationItem["type"]): NotificationChannel | null {
  if (
    type === "MODEL_NEW_APPLICATION" ||
    type === "MODEL_APPLICATION_RECEIVED" ||
    type === "MODEL_BOOKING_CREATED" ||
    type === "MODEL_TIME_CONFIRMED"
  ) {
    return "MASTER";
  }
  if (type === "MODEL_TIME_PROPOSED" || type === "MODEL_APPLICATION_REJECTED") return "SYSTEM";
  return null;
}

function toIsoDateLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function describeScheduleRequest(payloadJson: unknown): string {
  const payload = parseJsonPayload(payloadJson);
  if (!payload || typeof payload !== "object") {
    return "Мастер просит изменить график";
  }
  const range = (payload as { month?: unknown }).month;
  const date = toIsoDateLabel((payload as { date?: unknown }).date ?? range);
  return date ? `График на ${date}` : "Мастер просит изменить график";
}

/**
 * PHONE-CLAIM-01 / STUDIO-INVITE-EMAIL-01: какие приглашения пользователь
 * вправе видеть (телефон и почта, подтверждённые и нет), решает
 * `pendingInvitesVisibleToUserWhere` — одно место на центр и бейдж.
 */
async function listVisiblePendingInvites(userId: string) {
  const where = await pendingInvitesVisibleToUserWhere(userId);
  if (!where) return [];
  return prisma.studioInvite.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      studio: {
        select: {
          id: true,
          provider: {
            select: {
              name: true,
              tagline: true,
              avatarUrl: true,
              publicUsername: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

/**
 * Студии пользователя для канала STUDIO центра уведомлений:
 *  - `studioIds` — студии с АКТИВНЫМ членством (любая роль): запись такой
 *    студии классифицируется как STUDIO (`classifyNotificationChannel`);
 *  - `adminStudioIds` — где он OWNER/ADMIN или владелец: их заявки на смену
 *    графика приходят псевдо-уведомлениями.
 * MOBILE-STUDIO-C (ops): вынесено из `getNotificationCenterData`, чтобы лента
 * студии в приложении (`lib/notifications/studio-feed.ts`) считала то же множество.
 */
export async function loadNotificationStudioAudience(
  userId: string,
): Promise<{ studioIds: Set<string>; adminStudioIds: Set<string> }> {
  const [studioMemberships, ownedStudios] = await Promise.all([
    prisma.studioMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { studioId: true, roles: true },
    }),
    prisma.studio.findMany({
      where: {
        OR: [{ ownerUserId: userId }, { provider: { ownerUserId: userId } }],
      },
      select: { id: true },
    }),
  ]);
  const studioIds = new Set(studioMemberships.map((item) => item.studioId));
  const adminStudioIds = new Set(
    studioMemberships
      .filter((item) => item.roles.some((role) => role === StudioRole.OWNER || role === StudioRole.ADMIN))
      .map((item) => item.studioId)
  );
  ownedStudios.forEach((studio) => adminStudioIds.add(studio.id));
  return { studioIds, adminStudioIds };
}

/** Сколько ожидающих заявок на смену графика центр показывает псевдо-уведомлениями. */
export const SCHEDULE_REQUEST_ITEMS_LIMIT = 50;

/**
 * Ожидающие решения заявки мастеров на смену графика — псевдо-уведомления
 * канала STUDIO (id `schedule-request:<id>`, всегда непрочитанные; уходят из
 * списка, когда заявку решили). Не больше `SCHEDULE_REQUEST_ITEMS_LIMIT`, новые сверху.
 */
export async function loadPendingScheduleRequestItems(
  adminStudioIds: Iterable<string>,
): Promise<NotificationCenterNotificationItem[]> {
  const studioIdList = Array.from(adminStudioIds);
  const pendingScheduleRequests =
    studioIdList.length === 0
      ? []
      : await prisma.scheduleChangeRequest.findMany({
          where: {
            studioId: { in: studioIdList },
            status: "PENDING",
          },
          select: {
            id: true,
            studioId: true,
            providerId: true,
            status: true,
            payloadJson: true,
            createdAt: true,
            studio: {
              select: {
                provider: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: SCHEDULE_REQUEST_ITEMS_LIMIT,
        });

  const masterIds = Array.from(new Set(pendingScheduleRequests.map((item) => item.providerId)));
  const masters =
    masterIds.length === 0
      ? []
      : await prisma.provider.findMany({
          where: { id: { in: masterIds } },
          select: { id: true, name: true },
        });
  const masterNameById = new Map(
    masters.map((master) => [master.id, master.name || "Мастер"])
  );

  return pendingScheduleRequests.map((item) => {
    const masterName = masterNameById.get(item.providerId) ?? "Мастер";
    const details = describeScheduleRequest(item.payloadJson);
    return {
      id: `schedule-request:${item.id}`,
      title: "Мастер просит изменить график",
      // 29.09 · 01-а: название в «ёлочках», без слова «студия» — иначе
      // «студия Студия Ольги».
      body: [masterName, details, item.studio?.provider.name ? `«${item.studio.provider.name}»` : null]
        .filter(Boolean)
        .join(" · "),
      type: "SCHEDULE_REQUEST",
      channel: "STUDIO",
      isRead: false,
      readAt: null,
      createdAt: item.createdAt.toISOString(),
      payloadJson: null,
      // R2-06-D: schedule-change requests live on the dedicated
      // /schedule-requests page (with inline Approve/Reject), not /team.
      openHref: "/cabinet/studio/schedule-requests",
    };
  });
}

export async function getNotificationCenterData(input: {
  userId: string;
  phone: string | null;
}): Promise<NotificationCenterData> {
  const [audience, invites, notifications, unreadCount] = await Promise.all([
    loadNotificationStudioAudience(input.userId),
    listVisiblePendingInvites(input.userId),
    prisma.notification.findMany({
      where: { userId: input.userId, deletedAt: null },
      select: {
        id: true,
        title: true,
        body: true,
        type: true,
        payloadJson: true,
        isRead: true,
        readAt: true,
        createdAt: true,
        booking: {
          select: {
            id: true,
            status: true,
            studioId: true,
            // RESCHEDULE-CURRENT-TIME: живое время брони для центра.
            startAtUtc: true,
            proposedStartAt: true,
            actionRequiredBy: true,
            provider: {
              select: {
                type: true,
                ownerUserId: true,
                timezone: true,
              },
            },
            masterProvider: {
              select: {
                ownerUserId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({
      where: { userId: input.userId, isRead: false, deletedAt: null },
    }),
  ]);

  const { studioIds, adminStudioIds } = audience;
  const scheduleRequestNotifications = await loadPendingScheduleRequestItems(adminStudioIds);

  const timelineNotifications: NotificationCenterNotificationItem[] = [
    ...notifications.map((item) => {
      const payloadJson = mergeBookingPayload(item.payloadJson, item.booking);
      const channel: NotificationChannel =
        resolveModelChannel(item.type) ??
        (item.type.startsWith("STUDIO_") ? "STUDIO" : null) ??
        classifyNotificationChannel({
          userId: input.userId,
          studioIds,
          booking: item.booking,
        });
      return {
        id: item.id,
        title: item.title,
        body: item.body,
        type: item.type,
        channel,
        isRead: item.isRead,
        readAt: item.readAt ? item.readAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        payloadJson,
        openHref:
          resolveModelOpenHref(item.type, payloadJson) ??
          resolveChatOpenHref(item.type, payloadJson) ??
          // RESCHEDULE-CURRENT-TIME: канал нужен, потому что ответ клиента на
          // перенос уходит мастеру типами «клиентской» семантики.
          resolveNotificationOpenHref(item.type, payloadJson, channel),
      };
    }),
    ...scheduleRequestNotifications,
  ].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return {
    invites: invites.map((invite) => ({
      id: invite.id,
      studioId: invite.studio.id,
        studioName: invite.studio.provider.name,
        studioTagline: invite.studio.provider.tagline,
        studioAvatarUrl: invite.studio.provider.avatarUrl,
        studioPublicUsername: invite.studio.provider.publicUsername ?? null,
        createdAt: invite.createdAt.toISOString(),
      })),
    notifications: timelineNotifications,
    unreadCount: unreadCount + scheduleRequestNotifications.length,
    hasPhone: Boolean(input.phone && normalizeRussianPhone(input.phone)),
  };
}
