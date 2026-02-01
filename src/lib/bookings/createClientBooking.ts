import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { createBookingNotifications } from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";

export async function createClientBooking(
  userId: string,
  data: {
    providerId: string;
    serviceId: string;
    slotLabel: string;
    clientName: string;
    clientPhone: string;
    comment: string | null | undefined;
  }
): Promise<BookingDto> {
  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
    select: { id: true, providerId: true, name: true },
  });

  if (!service || service.providerId !== data.providerId) {
    throw new AppError("Service does not belong to provider", 400, "SERVICE_NOT_BELONGS_TO_PROVIDER");
  }

  const booking = await prisma.booking.create({
    data: {
      providerId: data.providerId,
      serviceId: data.serviceId,
      slotLabel: data.slotLabel,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      comment: data.comment,
      clientUserId: userId,
    },
    select: {
      id: true,
      slotLabel: true,
      status: true,
      providerId: true,
      masterProviderId: true,
      clientName: true,
      clientPhone: true,
      comment: true,
      startAtUtc: true,
      endAtUtc: true,
      service: { select: { id: true, name: true } },
    },
  });

  try {
    await createBookingNotifications({ bookingId: booking.id, kind: "CREATED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  try {
    await sendBookingTelegramNotifications(booking.id, "CREATED", { notifyClientOnCreate: true });
  } catch (error) {
    console.error("Failed to send Telegram booking notifications:", error);
  }

  return toBookingDto(booking);
}
