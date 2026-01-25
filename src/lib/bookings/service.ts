import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type BookingWithService = Prisma.BookingGetPayload<{ include: { service: true } }>;

type BookingResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; code?: string };

export async function getProviderBookingsForOwner(
  userId: string,
  providerId: string
): Promise<BookingResult<{ bookings: BookingWithService[] }>> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, ownerUserId: true },
  });

  if (!provider) {
    return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };
  }

  if (!provider.ownerUserId || provider.ownerUserId !== userId) {
    return { ok: false, status: 403, message: "Forbidden", code: "FORBIDDEN" };
  }

  const bookings = await prisma.booking.findMany({
    where: { providerId },
    orderBy: { createdAt: "desc" },
    include: { service: true },
    take: 200,
  });

  return { ok: true, data: { bookings } };
}

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
): Promise<BookingResult<{ booking: BookingWithService }>> {
  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
    select: { id: true, providerId: true },
  });

  if (!service || service.providerId !== data.providerId) {
    return {
      ok: false,
      status: 400,
      message: "Service does not belong to provider",
      code: "SERVICE_NOT_BELONGS_TO_PROVIDER",
    };
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
    include: { service: true },
  });

  return { ok: true, data: { booking } };
}
