import { MembershipStatus, NotificationType, ProviderType, StudioRole } from "@prisma/client";
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

function mergeBookingPayload(
  payloadJson: unknown,
  booking: { id: string; status: string } | null | undefined
): unknown {
  const parsed = parseJsonPayload(payloadJson);
  if (!booking) return parsed;

  const record = parsed && typeof parsed === "object" ? { ...(parsed as Record<string, unknown>) } : {};
  if (typeof record.bookingId !== "string" || record.bookingId.length === 0) {
    record.bookingId = booking.id;
  }
  record.bookingStatus = booking.status;
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
    return `/cabinet/master/model-offers?offerId=${record.offerId}`;
  }
  return undefined;
}

function resolveChatOpenHref(type: NotificationCenterNotificationItem["type"], payloadJson: unknown): string | undefined {
  if (type !== "CHAT_MESSAGE_RECEIVED") return undefined;
  const payload = parseJsonPayload(payloadJson);
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as { bookingId?: unknown; senderType?: unknown };
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return undefined;
  const params = new URLSearchParams({ bookingId: record.bookingId, chat: "open" });
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
    return "Запрос на изменение графика";
  }
  const range = (payload as { month?: unknown }).month;
  const date = toIsoDateLabel((payload as { date?: unknown }).date ?? range);
  return date ? `Изменение графика на ${date}` : "Запрос на изменение графика";
}

export async function getNotificationCenterData(input: {
  userId: string;
  phone: string | null;
}): Promise<NotificationCenterData> {
  const normalizedPhone = input.phone ? normalizeRussianPhone(input.phone) : null;

  const [studioMemberships, ownedStudios, invites, notifications, unreadCount] = await Promise.all([
    prisma.studioMembership.findMany({
      where: { userId: input.userId, status: MembershipStatus.ACTIVE },
      select: { studioId: true, roles: true },
    }),
    prisma.studio.findMany({
      where: {
        OR: [{ ownerUserId: input.userId }, { provider: { ownerUserId: input.userId } }],
      },
      select: { id: true },
    }),
    normalizedPhone
      ? prisma.studioInvite.findMany({
          where: {
            phone: normalizedPhone,
            status: MembershipStatus.PENDING,
          },
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
        })
      : Promise.resolve([]),
    prisma.notification.findMany({
      where: { userId: input.userId },
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
            provider: {
              select: {
                type: true,
                ownerUserId: true,
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
      where: { userId: input.userId, isRead: false },
    }),
  ]);

  const studioIds = new Set(studioMemberships.map((item) => item.studioId));
  const adminStudioIds = new Set(
    studioMemberships
      .filter((item) => item.roles.some((role) => role === StudioRole.OWNER || role === StudioRole.ADMIN))
      .map((item) => item.studioId)
  );
  ownedStudios.forEach((studio) => adminStudioIds.add(studio.id));

  const pendingScheduleRequests =
    adminStudioIds.size === 0
      ? []
      : await prisma.scheduleChangeRequest.findMany({
          where: {
            studioId: { in: Array.from(adminStudioIds) },
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
          take: 50,
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
    masters.map((master) => [master.id, master.name || "Master"])
  );

  const scheduleRequestNotifications: NotificationCenterNotificationItem[] =
    pendingScheduleRequests.map((item) => {
      const masterName = masterNameById.get(item.providerId) ?? "Мастер";
      const details = describeScheduleRequest(item.payloadJson);
      return {
        id: `schedule-request:${item.id}`,
        title: "Запрос на изменение графика",
        body: `${masterName} · ${details} · Статус: ${item.status} · Студия: ${item.studio?.provider.name ?? "Студия"}`,
        type: "SCHEDULE_REQUEST",
        channel: "STUDIO",
        isRead: false,
        readAt: null,
        createdAt: item.createdAt.toISOString(),
        payloadJson: null,
        openHref: "/cabinet/studio/team",
      };
    });

  const timelineNotifications: NotificationCenterNotificationItem[] = [
    ...notifications.map((item) => {
      const payloadJson = mergeBookingPayload(item.payloadJson, item.booking);
      return {
        id: item.id,
        title: item.title,
        body: item.body,
        type: item.type,
        channel:
          resolveModelChannel(item.type) ??
          (item.type.startsWith("STUDIO_") ? "STUDIO" : null) ??
          classifyNotificationChannel({
            userId: input.userId,
            studioIds,
            booking: item.booking,
          }),
        isRead: item.isRead,
        readAt: item.readAt ? item.readAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        payloadJson,
        openHref:
          resolveModelOpenHref(item.type, payloadJson) ??
          resolveChatOpenHref(item.type, payloadJson) ??
          resolveNotificationOpenHref(item.type, payloadJson),
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
    hasPhone: Boolean(normalizedPhone),
  };
}
