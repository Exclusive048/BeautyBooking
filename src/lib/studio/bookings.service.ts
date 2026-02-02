import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type MoveStrategy = "KEEP_SERVICE" | "CHANGE_SERVICE";
export type MovePricing = "KEEP_PRICE" | "APPLY_TARGET";

export async function createStudioBooking(input: {
  studioId: string;
  masterId: string;
  startAt: Date;
  serviceId: string;
  clientName: string;
  clientPhone?: string;
  notes?: string;
}): Promise<{ id: string }> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      studioId: studio.id,
    },
    select: {
      id: true,
      name: true,
      title: true,
      price: true,
      durationMin: true,
      basePrice: true,
      baseDurationMin: true,
      isActive: true,
    },
  });
  if (!service || !service.isActive) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }

  const master = await prisma.provider.findFirst({
    where: { id: input.masterId, type: "MASTER", studioId: studio.providerId },
    select: { id: true },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const override = await prisma.masterService.findUnique({
    where: {
      masterProviderId_serviceId: {
        masterProviderId: master.id,
        serviceId: service.id,
      },
    },
    select: {
      isEnabled: true,
      priceOverride: true,
      durationOverrideMin: true,
    },
  });
  if (!override || !override.isEnabled) {
    throw new AppError("Master does not provide this service", 409, "SERVICE_INVALID");
  }

  const durationMin = override.durationOverrideMin ?? service.baseDurationMin ?? service.durationMin;
  const price = override.priceOverride ?? service.basePrice ?? service.price;
  const endAt = new Date(input.startAt.getTime() + durationMin * 60 * 1000);

  const created = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        providerId: studio.providerId,
        studioId: studio.id,
        serviceId: service.id,
        masterProviderId: master.id,
        masterId: master.id,
        startAtUtc: input.startAt,
        endAtUtc: endAt,
        startAt: input.startAt,
        endAt,
        slotLabel: input.startAt.toISOString(),
        clientName: input.clientName.trim(),
        clientNameSnapshot: input.clientName.trim(),
        clientPhone: input.clientPhone?.trim() || "",
        clientPhoneSnapshot: input.clientPhone?.trim() || null,
        notes: input.notes?.trim() || null,
        status: "NEW",
        source: "MANUAL",
      },
      select: { id: true },
    });

    await tx.bookingServiceItem.create({
      data: {
        bookingId: booking.id,
        studioId: studio.id,
        serviceId: service.id,
        titleSnapshot: service.title?.trim() || service.name,
        priceSnapshot: price,
        durationSnapshotMin: durationMin,
      },
    });

    return booking;
  });

  return { id: created.id };
}

export async function moveStudioBooking(input: {
  studioId: string;
  bookingId: string;
  targetMasterId: string;
  targetStartAt: Date;
  strategy: MoveStrategy;
  pricing: MovePricing;
}): Promise<{ id: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      serviceItems: {
        select: {
          id: true,
          serviceId: true,
          durationSnapshotMin: true,
          priceSnapshot: true,
        },
      },
    },
  });
  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }
  if (booking.studioId && booking.studioId !== input.studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const durationMin = booking.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.durationSnapshotMin),
    0
  );
  const safeDuration = durationMin > 0 ? durationMin : 60;
  const endAt = new Date(input.targetStartAt.getTime() + safeDuration * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        studioId: input.studioId,
        masterProviderId: input.targetMasterId,
        masterId: input.targetMasterId,
        startAtUtc: input.targetStartAt,
        endAtUtc: endAt,
        startAt: input.targetStartAt,
        endAt,
      },
    });

    if (input.strategy === "CHANGE_SERVICE" || input.pricing === "APPLY_TARGET") {
      for (const item of booking.serviceItems) {
        if (!item.serviceId) continue;
        const override = await tx.masterService.findUnique({
          where: {
            masterProviderId_serviceId: {
              masterProviderId: input.targetMasterId,
              serviceId: item.serviceId,
            },
          },
          select: {
            isEnabled: true,
            priceOverride: true,
            durationOverrideMin: true,
            service: { select: { price: true, durationMin: true } },
          },
        });

        if (!override || !override.isEnabled) continue;

        await tx.bookingServiceItem.update({
          where: { id: item.id },
          data: {
            durationSnapshotMin:
              input.strategy === "CHANGE_SERVICE"
                ? override.durationOverrideMin ?? override.service.durationMin
                : item.durationSnapshotMin,
            priceSnapshot:
              input.pricing === "APPLY_TARGET"
                ? override.priceOverride ?? override.service.price
                : item.priceSnapshot,
          },
        });
      }
    }
  });

  return { id: booking.id };
}

export async function updateMasterBookingStatus(input: {
  bookingId: string;
  masterId: string;
  status: "STARTED" | "NO_SHOW" | "FINISHED";
}): Promise<{ id: string; status: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, masterProviderId: true },
  });
  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }
  if (booking.masterProviderId !== input.masterId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: input.status },
    select: { id: true, status: true },
  });

  return { id: updated.id, status: updated.status };
}
