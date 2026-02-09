import { BookingStatus, ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";

export type StudioDashboardStats = {
  bookingsTodayCount: number;
  bookingsTodayAmount: number;
  mastersTotal: number;
  mastersWorking: number | null;
  newClientsCount: number;
  reviewsCount: number;
};

type StudioContext = {
  id: string;
  providerId: string;
};

function startOfDayUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveBookingAmount(input: { serviceItems: Array<{ priceSnapshot: number }>; servicePrice: number }): number {
  const snapshotSum = input.serviceItems.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, input.servicePrice);
}

async function getStudioContext(studioId: string): Promise<StudioContext> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }
  return studio;
}

export async function getStudioDashboardStats(studioId: string): Promise<StudioDashboardStats> {
  const studio = await getStudioContext(studioId);

  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const todayEnd = addUtcDays(todayStart, 1);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = addUtcDays(todayStart, -6);

  const [bookingsToday, mastersTotal, scheduleCount, workingRules, recentBookings, reviewsCount] =
    await Promise.all([
      prisma.booking.findMany({
        where: {
          OR: [{ studioId: studio.id }, { providerId: studio.providerId }],
          startAtUtc: { gte: todayStart, lt: todayEnd },
          status: {
            notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
          },
        },
        select: {
          service: { select: { price: true } },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
      prisma.provider.count({
        where: { type: ProviderType.MASTER, studioId: studio.providerId },
      }),
      prisma.workDayRule.count({ where: { studioId: studio.id } }),
      prisma.workDayRule.findMany({
        where: {
          studioId: studio.id,
          weekday: now.getUTCDay(),
          isWorking: true,
        },
        select: { masterId: true },
        distinct: ["masterId"],
      }),
      prisma.booking.findMany({
        where: {
          OR: [{ studioId: studio.id }, { providerId: studio.providerId }],
          createdAt: { gte: last24h },
          status: {
            notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
          },
        },
        select: {
          id: true,
          clientUserId: true,
          clientPhone: true,
          clientPhoneSnapshot: true,
        },
      }),
      prisma.review.count({
        where: {
          studioId: studio.id,
          createdAt: { gte: last7Days },
        },
      }),
    ]);

  const bookingsTodayCount = bookingsToday.length;
  const bookingsTodayAmount = bookingsToday.reduce(
    (sum, booking) =>
      sum + resolveBookingAmount({ serviceItems: booking.serviceItems, servicePrice: booking.service.price }),
    0
  );

  const clientKeys = new Set<string>();
  for (const booking of recentBookings) {
    if (booking.clientUserId) {
      clientKeys.add(`user:${booking.clientUserId}`);
      continue;
    }
    const rawPhone = booking.clientPhoneSnapshot?.trim() || booking.clientPhone?.trim() || "";
    if (rawPhone) {
      const normalized = normalizeRussianPhone(rawPhone) ?? rawPhone;
      clientKeys.add(`phone:${normalized}`);
      continue;
    }
    clientKeys.add(`booking:${booking.id}`);
  }

  return {
    bookingsTodayCount,
    bookingsTodayAmount,
    mastersTotal,
    mastersWorking: scheduleCount > 0 ? workingRules.length : null,
    newClientsCount: clientKeys.size,
    reviewsCount,
  };
}
