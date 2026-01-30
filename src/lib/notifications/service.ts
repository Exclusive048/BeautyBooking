import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";

type BookingNotificationKind = "CREATED" | "CANCELLED" | "RESCHEDULED";

type BookingNotificationContext = {
  bookingId: string;
  kind: BookingNotificationKind;
};

function mapType(kind: BookingNotificationKind): NotificationType {
  switch (kind) {
    case "CANCELLED":
      return NotificationType.BOOKING_CANCELLED;
    case "RESCHEDULED":
      return NotificationType.BOOKING_RESCHEDULED;
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
    default:
      return "Новая запись";
  }
}

function buildBody(providerName: string, masterName: string | null): string {
  if (masterName) return `${providerName} · ${masterName}`;
  return providerName;
}

export async function createBookingNotifications(
  input: BookingNotificationContext
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      clientUserId: true,
      provider: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
        },
      },
      masterProvider: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
        },
      },
    },
  });

  if (!booking) return;

  const recipientIds = new Set<string>();
  if (booking.clientUserId) recipientIds.add(booking.clientUserId);

  const masterOwnerId =
    booking.masterProvider?.ownerUserId ?? booking.provider.ownerUserId ?? null;
  if (masterOwnerId) recipientIds.add(masterOwnerId);

  if (recipientIds.size === 0) return;

  const type = mapType(input.kind);
  const title = buildTitle(input.kind);
  const body = buildBody(booking.provider.name, booking.masterProvider?.name ?? null);

  await prisma.notification.createMany({
    data: Array.from(recipientIds).map((userId) => ({
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
