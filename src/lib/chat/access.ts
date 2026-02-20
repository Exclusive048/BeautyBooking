import { ChatSenderType, type BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getChatAvailability } from "@/lib/chat/status";

export type ChatAccessBooking = {
  id: string;
  status: BookingStatus;
  startAtUtc: Date | null;
  clientUserId: string | null;
  masterProvider: { ownerUserId: string | null; name?: string | null } | null;
};

export type ChatAvailability = ReturnType<typeof getChatAvailability>;

export type ChatAccessResult =
  | {
      ok: true;
      senderType: ChatSenderType;
      booking: ChatAccessBooking;
      availability: ChatAvailability;
    }
  | { ok: false; reason: "not-found" | "forbidden" | "conflict" };

export function resolveChatAccessForBooking(
  booking: ChatAccessBooking | null,
  userId: string
): ChatAccessResult {
  if (!booking) return { ok: false, reason: "not-found" };

  const isClient = Boolean(booking.clientUserId && booking.clientUserId === userId);
  const isMaster = Boolean(booking.masterProvider?.ownerUserId && booking.masterProvider.ownerUserId === userId);

  if (!isClient && !isMaster) {
    return { ok: false, reason: "forbidden" };
  }

  const availability = getChatAvailability(booking.status, booking.startAtUtc);
  if (!availability.isAvailable) {
    return { ok: false, reason: "conflict" };
  }

  return {
    ok: true,
    senderType: isClient ? ChatSenderType.CLIENT : ChatSenderType.MASTER,
    booking,
    availability,
  };
}

export async function resolveChatAccess(
  bookingId: string,
  userId: string
): Promise<ChatAccessResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      clientUserId: true,
      masterProvider: {
        select: {
          ownerUserId: true,
          name: true,
        },
      },
    },
  });

  return resolveChatAccessForBooking(booking, userId);
}
