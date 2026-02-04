import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type BookingNotificationKind = "CREATED" | "CANCELLED" | "RESCHEDULED" | "CONFIRMED" | "REJECTED" | "NO_SHOW";

type BookingNotificationContext = {
  bookingId: string;
  kind: BookingNotificationKind;
};

function mapType(kind: BookingNotificationKind): NotificationType {
  switch (kind) {
    case "CANCELLED":
    case "REJECTED":
    case "NO_SHOW":
      return NotificationType.BOOKING_CANCELLED;
    case "RESCHEDULED":
      return NotificationType.BOOKING_RESCHEDULED;
    case "CONFIRMED":
      return NotificationType.BOOKING_CREATED;
    default:
      return NotificationType.BOOKING_CREATED;
  }
}

function buildTitle(kind: BookingNotificationKind): string {
  switch (kind) {
    case "CANCELLED":
      return "Запись отменена";
    case "RESCHEDULED":
      return "Запись перенесена";
    case "CONFIRMED":
      return "Запись подтверждена";
    case "REJECTED":
      return "Запись отклонена";
    case "NO_SHOW":
      return "Клиент не пришел";
    default:
      return "Новая запись";
  }
}

function buildBody(input: {
  providerName: string;
  masterName: string | null;
  serviceName: string;
  startAtUtc: Date | null;
  clientName: string;
}): string {
  const parts: string[] = [input.providerName];
  if (input.masterName) {
    parts.push(input.masterName);
  }
  parts.push(input.serviceName, input.clientName);
  if (input.startAtUtc) {
    const label = input.startAtUtc.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    parts.push(label);
  }
  return parts.join(" · ");
}

export async function createBookingNotifications(input: BookingNotificationContext): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      clientUserId: true,
      clientName: true,
      startAtUtc: true,
      service: {
        select: {
          name: true,
          title: true,
        },
      },
      provider: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          masterProfile: {
            select: { userId: true },
          },
        },
      },
      masterProvider: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          masterProfile: {
            select: { userId: true },
          },
        },
      },
    },
  });

  if (!booking) return;

  const recipientIds = new Set<string>();
  if (booking.clientUserId) recipientIds.add(booking.clientUserId);

  const masterOwnerId =
    booking.masterProvider?.ownerUserId ??
    booking.masterProvider?.masterProfile?.userId ??
    booking.provider.ownerUserId ??
    booking.provider.masterProfile?.userId ??
    null;
  if (masterOwnerId) recipientIds.add(masterOwnerId);

  if (recipientIds.size === 0) return;

  const type = mapType(input.kind);
  const title = buildTitle(input.kind);
  const body = buildBody({
    providerName: booking.provider.name,
    masterName: booking.masterProvider?.name ?? null,
    serviceName: booking.service.title?.trim() || booking.service.name,
    startAtUtc: booking.startAtUtc ?? null,
    clientName: booking.clientName,
  });

  const users = Array.from(recipientIds);
  const existing = await prisma.notification.findMany({
    where: {
      bookingId: booking.id,
      type,
      title,
      userId: { in: users },
    },
    select: { userId: true },
  });
  const existingUsers = new Set(existing.map((item) => item.userId));
  const toCreate = users.filter((userId) => !existingUsers.has(userId));
  if (toCreate.length === 0) return;

  await prisma.notification.createMany({
    data: toCreate.map((userId) => ({
      userId,
      type,
      title,
      body,
      bookingId: booking.id,
    })),
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
