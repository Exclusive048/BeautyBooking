import type { Prisma } from "@prisma/client";
import { MembershipStatus, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBookingNotifications } from "@/lib/notifications/service";

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
    select: { id: true, ownerUserId: true, type: true, studioId: true },
  });

  if (!provider) {
    return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };
  }

  if (provider.ownerUserId && provider.ownerUserId === userId) {
    const bookings = await prisma.booking.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      include: { service: true },
      take: 200,
    });

    return { ok: true, data: { bookings } };
  }

  let studioId: string | null = null;

  if (provider.type === "STUDIO") {
    const studio = await prisma.studio.findUnique({
      where: { providerId: provider.id },
      select: { id: true },
    });
    studioId = studio?.id ?? null;
  } else if (provider.studioId) {
    const studio = await prisma.studio.findUnique({
      where: { providerId: provider.studioId },
      select: { id: true },
    });
    studioId = studio?.id ?? null;
  }

  if (!studioId) {
    return { ok: false, status: 403, message: "Forbidden", code: "FORBIDDEN" };
  }

  const membership = await prisma.studioMembership.findFirst({
    where: {
      userId,
      studioId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { id: true },
  });

  if (!membership) {
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

  try {
    await createBookingNotifications({ bookingId: booking.id, kind: "CREATED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  return { ok: true, data: { booking } };
}
