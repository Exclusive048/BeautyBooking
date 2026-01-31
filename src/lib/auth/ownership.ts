import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth/access";

type BookingAccess = {
  id: string;
  clientUserId: string | null;
  provider: {
    id: string;
    type: ProviderType;
    ownerUserId: string | null;
    studioId: string | null;
  };
  masterProvider: { ownerUserId: string | null } | null;
};

async function loadBookingAccess(bookingId: string): Promise<BookingAccess> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientUserId: true,
      provider: {
        select: {
          id: true,
          type: true,
          ownerUserId: true,
          studioId: true,
        },
      },
      masterProvider: { select: { ownerUserId: true } },
    },
  });
  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }
  return booking;
}

async function resolveStudioIdForProvider(provider: BookingAccess["provider"]): Promise<string | null> {
  if (provider.type === ProviderType.STUDIO) {
    const studio = await prisma.studio.findUnique({
      where: { providerId: provider.id },
      select: { id: true },
    });
    return studio?.id ?? null;
  }

  if (provider.studioId) {
    const studio = await prisma.studio.findUnique({
      where: { providerId: provider.studioId },
      select: { id: true },
    });
    return studio?.id ?? null;
  }

  return null;
}

async function isStudioAdmin(userId: string, studioId: string): Promise<boolean> {
  const membership = await prisma.studioMembership.findFirst({
    where: {
      userId,
      studioId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

function isProviderOwner(userId: string, provider: BookingAccess["provider"]): boolean {
  return Boolean(provider.ownerUserId && provider.ownerUserId === userId);
}

function isMasterOwner(userId: string, booking: BookingAccess): boolean {
  return Boolean(booking.masterProvider?.ownerUserId && booking.masterProvider.ownerUserId === userId);
}

function isClientOwner(userId: string, booking: BookingAccess): boolean {
  return Boolean(booking.clientUserId && booking.clientUserId === userId);
}

export async function requireProviderOwner(
  user: SessionUser,
  providerId: string
): Promise<void> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, ownerUserId: true, studioId: true },
  });
  if (!provider) throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");

  if (provider.ownerUserId === user.userId) return;

  const studioId = await resolveStudioIdForProvider(provider);
  if (studioId && (await isStudioAdmin(user.userId, studioId))) return;

  throw new AppError("Forbidden", 403, "FORBIDDEN");
}

export async function requireBookingCancelAccess(
  user: SessionUser,
  bookingId: string
): Promise<{ cancelledBy: "CLIENT" | "PROVIDER" }> {
  const booking = await loadBookingAccess(bookingId);

  if (isClientOwner(user.userId, booking)) {
    return { cancelledBy: "CLIENT" };
  }

  if (isProviderOwner(user.userId, booking.provider) || isMasterOwner(user.userId, booking)) {
    return { cancelledBy: "PROVIDER" };
  }

  const studioId = await resolveStudioIdForProvider(booking.provider);
  if (studioId && (await isStudioAdmin(user.userId, studioId))) {
    return { cancelledBy: "PROVIDER" };
  }

  throw new AppError("Forbidden", 403, "FORBIDDEN");
}

export async function requireBookingConfirmAccess(
  user: SessionUser,
  bookingId: string
): Promise<void> {
  const booking = await loadBookingAccess(bookingId);

  if (isProviderOwner(user.userId, booking.provider) || isMasterOwner(user.userId, booking)) {
    return;
  }

  const studioId = await resolveStudioIdForProvider(booking.provider);
  if (studioId && (await isStudioAdmin(user.userId, studioId))) return;

  throw new AppError("Forbidden", 403, "FORBIDDEN");
}

export async function requireBookingRescheduleAccess(
  user: SessionUser,
  bookingId: string
): Promise<void> {
  const booking = await loadBookingAccess(bookingId);

  if (isClientOwner(user.userId, booking)) return;
  if (isProviderOwner(user.userId, booking.provider) || isMasterOwner(user.userId, booking)) return;

  const studioId = await resolveStudioIdForProvider(booking.provider);
  if (studioId && (await isStudioAdmin(user.userId, studioId))) return;

  throw new AppError("Forbidden", 403, "FORBIDDEN");
}

export async function requireMasterOwner(userId: string, masterId: string): Promise<void> {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, type: true, ownerUserId: true },
  });
  if (!master || master.type !== ProviderType.MASTER) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }
  if (master.ownerUserId !== userId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
}
