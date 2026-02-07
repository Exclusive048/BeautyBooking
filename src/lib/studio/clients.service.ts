import { AppError } from "@/lib/api/errors";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";

export type StudioClientListItem = {
  key: string;
  displayName: string;
  phone: string;
  lastBookingAt: string;
  lastServiceName: string;
  visitsCount: number;
};

export type StudioClientsData = {
  clients: StudioClientListItem[];
};

type GroupedClient = {
  key: string;
  displayName: string;
  phone: string;
  lastBookingAt: Date;
  lastServiceName: string;
  visitsCount: number;
};

type BookingRow = {
  id: string;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  clientNameSnapshot: string | null;
  clientPhoneSnapshot: string | null;
  startAtUtc: Date | null;
  createdAt: Date;
  service: {
    name: string;
    title: string | null;
  };
  serviceItems: Array<{
    titleSnapshot: string;
  }>;
};

function resolveBookingPhone(booking: BookingRow): string | null {
  const source = booking.clientPhoneSnapshot?.trim() || booking.clientPhone?.trim() || "";
  if (!source) return null;
  return normalizeRussianPhone(source) ?? source;
}

function resolveBookingName(booking: BookingRow): string {
  return booking.clientNameSnapshot?.trim() || booking.clientName.trim() || "Client";
}

function resolveServiceTitle(booking: BookingRow): string {
  const snapshot = booking.serviceItems[0]?.titleSnapshot?.trim();
  if (snapshot) return snapshot;
  return booking.service.title?.trim() || booking.service.name;
}

function bookingSortDate(booking: BookingRow): Date {
  return booking.startAtUtc ?? booking.createdAt;
}

function clientSortDate(client: GroupedClient): number {
  return client.lastBookingAt.getTime();
}

export async function getStudioClients(studioId: string): Promise<StudioClientsData> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ studioId: studio.id }, { providerId: studio.providerId }],
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
    },
    select: {
      id: true,
      clientUserId: true,
      clientName: true,
      clientPhone: true,
      clientNameSnapshot: true,
      clientPhoneSnapshot: true,
      startAtUtc: true,
      createdAt: true,
      service: {
        select: {
          name: true,
          title: true,
        },
      },
      serviceItems: {
        select: { titleSnapshot: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
    orderBy: [{ startAtUtc: "desc" }, { createdAt: "desc" }],
  });

  const grouped = new Map<string, GroupedClient>();

  for (const booking of bookings) {
    const phone = resolveBookingPhone(booking);
    const userId = booking.clientUserId ?? null;
    const key = userId ? `user:${userId}` : phone ? `phone:${phone}` : `booking:${booking.id}`;

    const visitDate = bookingSortDate(booking);
    const serviceTitle = resolveServiceTitle(booking);
    const displayName = resolveBookingName(booking);
    const safePhone = phone ?? "Unknown";

    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        key,
        displayName,
        phone: safePhone,
        lastBookingAt: visitDate,
        lastServiceName: serviceTitle,
        visitsCount: 1,
      });
      continue;
    }

    current.visitsCount += 1;
    if (visitDate.getTime() > current.lastBookingAt.getTime()) {
      current.lastBookingAt = visitDate;
      current.lastServiceName = serviceTitle;
      current.displayName = displayName;
      current.phone = safePhone;
    }
  }

  const clients = Array.from(grouped.values())
    .sort((a, b) => clientSortDate(b) - clientSortDate(a))
    .map((item) => ({
      key: item.key,
      displayName: item.displayName,
      phone: item.phone,
      lastBookingAt: item.lastBookingAt.toISOString(),
      lastServiceName: item.lastServiceName,
      visitsCount: item.visitsCount,
    }));

  return { clients };
}
