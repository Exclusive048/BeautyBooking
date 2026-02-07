import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { getCurrentMasterProviderId } from "@/lib/master/access";

export type ProviderAppointmentItem = {
  id: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  clientName: string;
  serviceName: string;
  rawStatus: string;
  status: string;
};

export type ProviderAppointmentsResponse = {
  date: string;
  timezone: string;
  items: ProviderAppointmentItem[];
};

export async function listProviderAppointmentsForDate(input: {
  userId: string;
  date: string;
}): Promise<ProviderAppointmentsResponse> {
  const providerId = await getCurrentMasterProviderId(input.userId);
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { timezone: true },
  });
  if (!provider) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  const start = dateFromLocalDateKey(input.date, provider.timezone, 0, 0);
  const end = dateFromLocalDateKey(addDaysToDateKey(input.date, 1), provider.timezone, 0, 0);
  const now = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ masterProviderId: providerId }, { masterProviderId: null, providerId }],
      startAtUtc: { gte: start, lt: end },
    },
    select: {
      id: true,
      startAtUtc: true,
      endAtUtc: true,
      status: true,
      clientName: true,
      service: { select: { name: true, title: true } },
    },
    orderBy: { startAtUtc: "asc" },
  });

  const items = bookings.map((booking) => ({
    id: booking.id,
    startAtUtc: booking.startAtUtc ? booking.startAtUtc.toISOString() : null,
    endAtUtc: booking.endAtUtc ? booking.endAtUtc.toISOString() : null,
    clientName: booking.clientName,
    serviceName: booking.service.title?.trim() || booking.service.name,
    rawStatus: booking.status,
    status: resolveBookingRuntimeStatus({
      status: booking.status,
      startAtUtc: booking.startAtUtc,
      endAtUtc: booking.endAtUtc,
      now,
    }),
  }));

  return {
    date: input.date,
    timezone: provider.timezone,
    items,
  };
}
