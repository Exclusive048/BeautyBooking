import { MembershipStatus, NotificationType, ProviderType, StudioRole } from "@prisma/client";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";

export type NotificationChannel = "MASTER" | "STUDIO" | "SYSTEM";

export type NotificationCenterInviteItem = {
  id: string;
  studioId: string;
  studioName: string;
  studioTagline: string | null;
  studioAvatarUrl: string | null;
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

function classifyNotificationChannel(input: {
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

function parseJsonPayload(payloadJson: string): unknown {
  try {
    return JSON.parse(payloadJson) as unknown;
  } catch {
    return null;
  }
}

function toIsoDateLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function toIsoDateTimeLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

function describeScheduleRequest(input: {
  type: "OFF" | "SHIFT" | "BLOCK";
  payloadJson: string;
}): string {
  const payload = parseJsonPayload(input.payloadJson);
  if (!payload || typeof payload !== "object") {
    return input.type === "OFF"
      ? "Запрос на выходной"
      : input.type === "SHIFT"
        ? "Запрос на изменение рабочего времени"
        : "Запрос на блок времени";
  }

  if (input.type === "OFF") {
    const date = toIsoDateLabel((payload as { date?: unknown }).date);
    return date ? `Выходной на ${date}` : "Запрос на выходной";
  }

  if (input.type === "SHIFT") {
    const date = toIsoDateLabel((payload as { date?: unknown }).date);
    const startTime = (payload as { startTime?: unknown }).startTime;
    const endTime = (payload as { endTime?: unknown }).endTime;
    const shiftTime =
      typeof startTime === "string" && typeof endTime === "string"
        ? `${startTime}-${endTime}`
        : null;
    if (date && shiftTime) return `Смена на ${date} (${shiftTime})`;
    if (date) return `Смена на ${date}`;
    return "Запрос на изменение рабочего времени";
  }

  const startAt = toIsoDateTimeLabel((payload as { startAt?: unknown }).startAt);
  const endAt = toIsoDateTimeLabel((payload as { endAt?: unknown }).endAt);
  const blockType = (payload as { type?: unknown }).type;
  const blockLabel = blockType === "BREAK" ? "Перерыв" : "Блок";
  if (startAt && endAt) return `${blockLabel}: ${startAt} - ${endAt}`;
  return "Запрос на блок времени";
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
            masterId: true,
            type: true,
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

  const masterIds = Array.from(new Set(pendingScheduleRequests.map((item) => item.masterId)));
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
      const masterName = masterNameById.get(item.masterId) ?? "Master";
      const details = describeScheduleRequest({
        type: item.type,
        payloadJson: item.payloadJson,
      });
      return {
        id: `schedule-request:${item.id}`,
        title: "Запрос на изменение графика",
        body: `${masterName} · ${details} · Статус: ${item.status} · Студия: ${item.studio.provider.name}`,
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
    ...notifications.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      type: item.type,
      channel: classifyNotificationChannel({
        userId: input.userId,
        studioIds,
        booking: item.booking,
      }),
      isRead: item.isRead,
      readAt: item.readAt ? item.readAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      payloadJson: item.payloadJson ?? null,
    })),
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
      createdAt: invite.createdAt.toISOString(),
    })),
    notifications: timelineNotifications,
    unreadCount: unreadCount + scheduleRequestNotifications.length,
    hasPhone: Boolean(normalizedPhone),
  };
}
