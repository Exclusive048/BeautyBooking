import { AppError } from "@/lib/api/errors";
import { toBookingDto as toNormalizedBookingDto } from "@/lib/bookings/toBookingDto";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { prisma } from "@/lib/prisma";
import { ScheduleEngine } from "@/lib/schedule/engine";
import type { BookingStatus } from "@prisma/client";

export type MasterDayBooking = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  rawStatus: string;
  status: string;
  canNoShow: boolean;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  requestedBy: "CLIENT" | "MASTER" | null;
  changeComment: string | null;
  clientName: string;
  clientPhone: string;
  notes: string | null;
  silentMode: boolean;
  serviceTitle: string;
  serviceName: string;
  durationMin: number;
};

export type MasterDayGap = {
  startAt: string;
  endAt: string;
  minutes: number;
};

export type MasterDayReview = {
  id: string;
  rating: number;
  text: string | null;
  authorName: string;
  createdAt: string;
};

export type MasterDayServiceOption = {
  id: string;
  title: string;
  price: number;
  durationMin: number;
};

export type MasterDayWorkingHours = {
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  bufferBetweenBookingsMin: number;
  timezone: string;
};

type BaseDayData = {
  masterId: string;
  date: string;
  isSolo: boolean;
  workingHours: MasterDayWorkingHours;
  newBookingsCount: number;
  bookings: MasterDayBooking[];
  currentBookingId: string | null;
  nextBookingId: string | null;
  monthEarnings: number;
  upcomingGaps: MasterDayGap[];
  latestReviews: MasterDayReview[];
  services: MasterDayServiceOption[];
};

function parseDateKey(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Invalid date", 400, "DATE_INVALID");
  }
  return parsed;
}

function sumBookingPrice(input: { serviceItems: Array<{ priceSnapshot: number }>; servicePrice: number }): number {
  const snap = input.serviceItems.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
  return snap > 0 ? snap : input.servicePrice;
}

function computeGaps(bookings: MasterDayBooking[], dateKey: string): MasterDayGap[] {
  const workStart = new Date(`${dateKey}T09:00:00.000Z`).getTime();
  const workEnd = new Date(`${dateKey}T21:00:00.000Z`).getTime();

  const ranges = bookings
    .map((item) => {
      if (!item.startAt || !item.endAt) return null;
      return {
        start: new Date(item.startAt).getTime(),
        end: new Date(item.endAt).getTime(),
      };
    })
    .filter((item): item is { start: number; end: number } => item !== null)
    .sort((a, b) => a.start - b.start);

  const now = Date.now();
  let cursor = Math.max(workStart, now);
  const result: MasterDayGap[] = [];

  for (const range of ranges) {
    if (range.end <= cursor) continue;
    if (range.start > cursor) {
      const minutes = Math.floor((range.start - cursor) / 60000);
      if (minutes >= 30) {
        result.push({
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(range.start).toISOString(),
          minutes,
        });
      }
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < workEnd) {
    const minutes = Math.floor((workEnd - cursor) / 60000);
    if (minutes >= 30) {
      result.push({
        startAt: new Date(cursor).toISOString(),
        endAt: new Date(workEnd).toISOString(),
        minutes,
      });
    }
  }

  return result.slice(0, 3);
}

function deriveBookingStatus(input: {
  rawStatus: BookingStatus;
  startAt: Date | null;
  endAt: Date | null;
  now: Date;
}): string {
  return resolveBookingRuntimeStatus({
    status: input.rawStatus,
    startAtUtc: input.startAt,
    endAtUtc: input.endAt,
    now: input.now,
  });
}

function canMarkNoShow(): boolean {
  return false;
}

export async function getMasterDay(input: {
  masterId: string;
  date: string;
}): Promise<BaseDayData> {
  // AUDIT (in-app индикатор новых записей):
  // - реализовано: newBookingsCount считается по createdAt > lastBookingsSeenAt.
  // - реализовано: при lastBookingsSeenAt=null считаются все записи как новые.
  const start = parseDateKey(input.date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const monthStart = new Date(start);
  monthStart.setUTCDate(1);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const master = await prisma.provider.findUnique({
    where: { id: input.masterId },
    select: {
      id: true,
      studioId: true,
      timezone: true,
      bufferBetweenBookingsMin: true,
      masterProfile: {
        select: { lastBookingsSeenAt: true },
      },
    },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const [bookingsRaw, finishedMonth, reviews, services, newBookingsCount] = await prisma.$transaction([
    prisma.booking.findMany({
      where: {
        OR: [
          { masterProviderId: input.masterId },
          { masterProviderId: null, providerId: input.masterId },
        ],
        startAtUtc: { gte: start, lt: end },
      },
      select: {
        id: true,
        startAtUtc: true,
        endAtUtc: true,
        status: true,
        proposedStartAt: true,
        proposedEndAt: true,
        actionRequiredBy: true,
        requestedBy: true,
        changeComment: true,
        clientName: true,
        clientPhone: true,
        notes: true,
        silentMode: true,
        service: { select: { name: true, title: true, durationMin: true } },
      },
      orderBy: { startAtUtc: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        OR: [
          { masterProviderId: input.masterId },
          { masterProviderId: null, providerId: input.masterId },
        ],
        startAtUtc: { gte: monthStart, lt: monthEnd },
        status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      },
      select: {
        status: true,
        startAtUtc: true,
        endAtUtc: true,
        service: { select: { price: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
    }),
    prisma.review.findMany({
      where: {
        targetType: "provider",
        targetId: input.masterId,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        author: { select: { displayName: true } },
        booking: { select: { clientName: true } },
      },
    }),
    prisma.service.findMany({
      where: {
        providerId: input.masterId,
        isEnabled: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        title: true,
        price: true,
        durationMin: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.booking.count({
      where: {
        OR: [
          { masterProviderId: input.masterId },
          { masterProviderId: null, providerId: input.masterId },
        ],
        ...(master.masterProfile?.lastBookingsSeenAt
          ? { createdAt: { gt: master.masterProfile.lastBookingsSeenAt } }
          : {}),
      },
    }),
  ]);

  const nowDate = new Date();
  const now = nowDate.getTime();
  const bookings: MasterDayBooking[] = bookingsRaw.map((item) => {
    const startAtDate = item.startAtUtc ?? null;
    const endAtDate = item.endAtUtc ?? null;
    const baseDto = toNormalizedBookingDto({
      id: item.id,
      status: item.status,
      startAtUtc: startAtDate,
      endAtUtc: endAtDate,
      clientName: item.clientName,
      clientPhone: item.clientPhone,
      serviceName: item.service.title?.trim() || item.service.name,
      durationMin: item.service.durationMin,
    });
    const status = deriveBookingStatus({
      rawStatus: item.status,
      startAt: startAtDate,
      endAt: endAtDate,
      now: nowDate,
    });
    return {
      id: baseDto.id,
      startAt: baseDto.startAtUtc,
      endAt: baseDto.endAtUtc,
      startAtUtc: baseDto.startAtUtc,
      endAtUtc: baseDto.endAtUtc,
      proposedStartAt: item.proposedStartAt ? item.proposedStartAt.toISOString() : null,
      proposedEndAt: item.proposedEndAt ? item.proposedEndAt.toISOString() : null,
      rawStatus: item.status,
      status,
      canNoShow: canMarkNoShow(),
      actionRequiredBy: item.actionRequiredBy ?? null,
      requestedBy: item.requestedBy ?? null,
      changeComment: item.changeComment ?? null,
      clientName: item.clientName,
      clientPhone: item.clientPhone,
      notes: item.notes ?? null,
      silentMode: item.silentMode,
      serviceTitle: baseDto.serviceName,
      serviceName: baseDto.serviceName,
      durationMin: baseDto.durationMin,
    };
  });

  const current = bookings.find((item) => {
    if (!item.startAt || !item.endAt) return false;
    if (item.status === "REJECTED" || item.status === "FINISHED") return false;
    const from = new Date(item.startAt).getTime();
    const to = new Date(item.endAt).getTime();
    return now >= from && now < to;
  });
  const next = bookings.find((item) => {
    if (!item.startAt) return false;
    return new Date(item.startAt).getTime() > now;
  });

  const monthEarnings = finishedMonth.reduce((sum, item) => {
    const status = resolveBookingRuntimeStatus({
      status: item.status,
      startAtUtc: item.startAtUtc,
      endAtUtc: item.endAtUtc,
      now: nowDate,
    });
    if (status !== "FINISHED") return sum;
    return sum + sumBookingPrice({ serviceItems: item.serviceItems, servicePrice: item.service.price });
  }, 0);

  const dayPlan = await ScheduleEngine.getDayPlan({
    masterId: input.masterId,
    date: input.date,
    timezone: master.timezone,
  });

  return {
    masterId: input.masterId,
    date: input.date,
    isSolo: master.studioId == null,
    workingHours: {
      isDayOff: !dayPlan.isWorking,
      startLocal: dayPlan.workingIntervals[0]?.start ?? null,
      endLocal: dayPlan.workingIntervals[0]?.end ?? null,
      bufferBetweenBookingsMin: master.bufferBetweenBookingsMin,
      timezone: master.timezone,
    },
    newBookingsCount,
    bookings,
    currentBookingId: current?.id ?? null,
    nextBookingId: next?.id ?? null,
    monthEarnings,
    upcomingGaps: computeGaps(bookings, input.date),
    latestReviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      text: review.text ?? null,
      authorName: review.author.displayName?.trim() || review.booking?.clientName || "Client",
      createdAt: review.createdAt.toISOString(),
    })),
    services: services.map((service) => ({
      id: service.id,
      title: service.title?.trim() || service.name,
      price: service.price,
      durationMin: service.durationMin,
    })),
  };
}

export async function createSoloMasterBooking(input: {
  masterId: string;
  serviceId: string;
  startAt: Date;
  clientName: string;
  clientPhone?: string;
  notes?: string;
}): Promise<{ id: string }> {
  const master = await prisma.provider.findUnique({
    where: { id: input.masterId },
    select: { id: true, studioId: true, type: true },
  });
  if (!master || master.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }
  if (master.studioId !== null) {
    throw new AppError("Manual booking is available only for solo masters", 403, "FORBIDDEN");
  }

  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      providerId: input.masterId,
      isEnabled: true,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      title: true,
      durationMin: true,
      price: true,
    },
  });
  if (!service) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }

  const endAt = new Date(input.startAt.getTime() + service.durationMin * 60000);

  const created = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        providerId: input.masterId,
        masterProviderId: input.masterId,
        masterId: input.masterId,
        serviceId: service.id,
        startAtUtc: input.startAt,
        endAtUtc: endAt,
        startAt: input.startAt,
        endAt,
        slotLabel: input.startAt.toISOString(),
        clientName: input.clientName.trim(),
        clientPhone: input.clientPhone?.trim() || "",
        notes: input.notes?.trim() || null,
        source: "MANUAL",
        status: "PENDING",
        actionRequiredBy: "MASTER",
      },
      select: { id: true },
    });

    await tx.bookingServiceItem.create({
      data: {
        bookingId: booking.id,
        serviceId: service.id,
        titleSnapshot: service.title?.trim() || service.name,
        priceSnapshot: service.price,
        durationSnapshotMin: service.durationMin,
      },
    });

    return booking;
  });

  await invalidateSlotsForBookingRange({
    providerId: input.masterId,
    masterProviderId: input.masterId,
    startAtUtc: input.startAt,
    endAtUtc: endAt,
  });

  return { id: created.id };
}
