import { MembershipStatus, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { toBookingDto, toClientBookingDto } from "@/lib/bookings/mappers";
import type { BookingClientDto, BookingDto } from "@/lib/bookings/dto";

async function resolveStudioId(providerId: string): Promise<string | null> {
  const studio = await prisma.studio.findUnique({
    where: { providerId },
    select: { id: true },
  });
  return studio?.id ?? null;
}

async function requireStudioAdmin(userId: string, studioId: string): Promise<void> {
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
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
}

export async function listProviderBookingsForOwner(
  userId: string,
  providerId: string
): Promise<BookingDto[]> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, ownerUserId: true, type: true, studioId: true },
  });

  if (!provider) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  if (provider.ownerUserId && provider.ownerUserId === userId) {
    const bookings = await prisma.booking.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slotLabel: true,
        status: true,
        providerId: true,
        masterProviderId: true,
        clientName: true,
        clientPhone: true,
        comment: true,
          silentMode: true,
          startAtUtc: true,
          endAtUtc: true,
          proposedStartAt: true,
          proposedEndAt: true,
          requestedBy: true,
          actionRequiredBy: true,
          changeComment: true,
          clientChangeRequestsCount: true,
          masterChangeRequestsCount: true,
          service: { select: { id: true, name: true } },
        },
        take: 200,
    });
    return bookings.map(toBookingDto);
  }

  let studioId: string | null = null;

  if (provider.type === "STUDIO") {
    studioId = await resolveStudioId(provider.id);
  } else if (provider.studioId) {
    studioId = await resolveStudioId(provider.studioId);
  }

  if (!studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  await requireStudioAdmin(userId, studioId);

  const bookings = await prisma.booking.findMany({
    where: { providerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slotLabel: true,
      status: true,
      providerId: true,
      masterProviderId: true,
      clientName: true,
      clientPhone: true,
      comment: true,
      silentMode: true,
      startAtUtc: true,
      endAtUtc: true,
      proposedStartAt: true,
      proposedEndAt: true,
      requestedBy: true,
      actionRequiredBy: true,
      changeComment: true,
      clientChangeRequestsCount: true,
      masterChangeRequestsCount: true,
      service: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return bookings.map(toBookingDto);
}

export async function listClientBookings(userId: string): Promise<BookingClientDto[]> {
  const bookings = await prisma.booking.findMany({
    where: { clientUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      slotLabel: true,
      status: true,
      providerId: true,
      masterProviderId: true,
      clientName: true,
      clientPhone: true,
      comment: true,
      silentMode: true,
      startAtUtc: true,
      endAtUtc: true,
      proposedStartAt: true,
      proposedEndAt: true,
      requestedBy: true,
      actionRequiredBy: true,
      changeComment: true,
      clientChangeRequestsCount: true,
      masterChangeRequestsCount: true,
      service: { select: { id: true, name: true, price: true, durationMin: true } },
      provider: {
        select: {
          id: true,
          name: true,
          district: true,
          address: true,
          type: true,
          publicUsername: true,
          avatarUrl: true,
        },
      },
      masterProvider: {
        select: {
          id: true,
          name: true,
          district: true,
          address: true,
          type: true,
          publicUsername: true,
          avatarUrl: true,
        },
      },
    },
  });

  return bookings.map(toClientBookingDto);
}
