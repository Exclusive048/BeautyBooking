import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type MasterDayBooking = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  status: string;
  clientName: string;
  clientPhone: string;
  notes: string | null;
  serviceTitle: string;
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

type BaseDayData = {
  date: string;
  isSolo: boolean;
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

export async function getMasterDay(input: {
  masterId: string;
  date: string;
}): Promise<BaseDayData> {
  const start = parseDateKey(input.date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const monthStart = new Date(start);
  monthStart.setUTCDate(1);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const master = await prisma.provider.findUnique({
    where: { id: input.masterId },
    select: { id: true, studioId: true },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const [bookingsRaw, finishedMonth, reviews, services] = await Promise.all([
    prisma.booking.findMany({
      where: {
        masterProviderId: input.masterId,
        startAtUtc: { gte: start, lt: end },
      },
      select: {
        id: true,
        startAtUtc: true,
        endAtUtc: true,
        status: true,
        clientName: true,
        clientPhone: true,
        notes: true,
        service: { select: { name: true, title: true } },
      },
      orderBy: { startAtUtc: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        masterProviderId: input.masterId,
        status: "FINISHED",
        startAtUtc: { gte: monthStart, lt: monthEnd },
      },
      select: {
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
  ]);

  const bookings: MasterDayBooking[] = bookingsRaw.map((item) => ({
    id: item.id,
    startAt: item.startAtUtc ? item.startAtUtc.toISOString() : null,
    endAt: item.endAtUtc ? item.endAtUtc.toISOString() : null,
    status: item.status,
    clientName: item.clientName,
    clientPhone: item.clientPhone,
    notes: item.notes ?? null,
    serviceTitle: item.service.title?.trim() || item.service.name,
  }));

  const now = Date.now();
  const current = bookings.find((item) => {
    if (!item.startAt || !item.endAt) return false;
    const from = new Date(item.startAt).getTime();
    const to = new Date(item.endAt).getTime();
    return now >= from && now < to;
  });
  const next = bookings.find((item) => {
    if (!item.startAt) return false;
    return new Date(item.startAt).getTime() > now;
  });

  const monthEarnings = finishedMonth.reduce(
    (sum, item) => sum + sumBookingPrice({ serviceItems: item.serviceItems, servicePrice: item.service.price }),
    0
  );

  return {
    date: input.date,
    isSolo: master.studioId == null,
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
        status: "NEW",
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

  return { id: created.id };
}
