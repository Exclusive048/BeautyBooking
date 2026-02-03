import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { createBookingNotifications } from "@/lib/notifications/service";

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

  try {
    await createBookingNotifications({ bookingId: created.id, kind: "CREATED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

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
  status: "CONFIRMED" | "CANCELLED" | "NO_SHOW";
}): Promise<{ id: string; status: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, masterProviderId: true, status: true, startAtUtc: true, endAtUtc: true },
  });
  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }
  if (booking.masterProviderId !== input.masterId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (booking.status === "CANCELLED" || booking.status === "NO_SHOW" || booking.status === "FINISHED") {
    throw new AppError("Booking is in terminal state", 409, "VALIDATION_ERROR");
  }

  if (input.status === "NO_SHOW") {
    if (booking.status !== "CONFIRMED") {
      throw new AppError("No-show is allowed only for confirmed bookings", 409, "VALIDATION_ERROR");
    }
    if (!booking.startAtUtc || !booking.endAtUtc) {
      throw new AppError("Booking time is missing", 409, "BOOKING_TIME_REQUIRED");
    }
    const now = Date.now();
    const from = booking.startAtUtc.getTime();
    const graceMs = 60 * 60 * 1000;
    const to = booking.endAtUtc.getTime() + graceMs;
    if (now < from || now > to) {
      throw new AppError("No-show is not available yet", 409, "VALIDATION_ERROR");
    }
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data:
      input.status === "CANCELLED"
        ? { status: input.status, cancelledBy: "PROVIDER" }
        : { status: input.status },
    select: { id: true, status: true },
  });

  if (input.status === "CONFIRMED") {
    try {
      await createBookingNotifications({ bookingId: updated.id, kind: "CONFIRMED" });
    } catch (error) {
      console.error("Failed to create booking notifications:", error);
    }
  }

  if (input.status === "CANCELLED") {
    try {
      await createBookingNotifications({ bookingId: updated.id, kind: "REJECTED" });
    } catch (error) {
      console.error("Failed to create booking notifications:", error);
    }
  }

  if (input.status === "NO_SHOW") {
    try {
      await createBookingNotifications({ bookingId: updated.id, kind: "NO_SHOW" });
    } catch (error) {
      console.error("Failed to create booking notifications:", error);
    }
  }

  return { id: updated.id, status: updated.status };
}
