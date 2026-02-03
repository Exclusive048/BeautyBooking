import { MembershipStatus, ProviderType } from "@prisma/client";
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
  body: string | null;
  type: "BOOKING_CREATED" | "BOOKING_CANCELLED" | "BOOKING_RESCHEDULED";
  channel: NotificationChannel;
  readAt: string | null;
  createdAt: string;
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

export async function getNotificationCenterData(input: {
  userId: string;
  phone: string | null;
}): Promise<NotificationCenterData> {
  const normalizedPhone = input.phone ? normalizeRussianPhone(input.phone) : null;

  const [studioMemberships, invites, notifications, unreadCount] = await Promise.all([
    prisma.studioMembership.findMany({
      where: { userId: input.userId, status: MembershipStatus.ACTIVE },
      select: { studioId: true },
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
      where: { userId: input.userId, readAt: null },
    }),
  ]);

  const studioIds = new Set(studioMemberships.map((item) => item.studioId));

  return {
    invites: invites.map((invite) => ({
      id: invite.id,
      studioId: invite.studio.id,
      studioName: invite.studio.provider.name,
      studioTagline: invite.studio.provider.tagline,
      studioAvatarUrl: invite.studio.provider.avatarUrl,
      createdAt: invite.createdAt.toISOString(),
    })),
    notifications: notifications.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      type: item.type,
      channel: classifyNotificationChannel({
        userId: input.userId,
        studioIds,
        booking: item.booking,
      }),
      readAt: item.readAt ? item.readAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
    })),
    unreadCount,
    hasPhone: Boolean(normalizedPhone),
  };
}
