import { AppError } from "@/lib/api/errors";
import { applyProfileNames, calculateDaysSinceLastVisit, groupBookings, type BookingClientRow } from "@/lib/crm/clients";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type ClientCardSummary = {
  id: string;
  tags: string[];
  hasNotes: boolean;
  photosCount: number;
};

export type MasterClientListItem = {
  key: string;
  clientUserId: string | null;
  displayName: string;
  phone: string;
  lastBookingAt: string;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  lastServiceName: string;
  visitsCount: number;
  totalAmount: number;
  card: ClientCardSummary | null;
};

export type MasterClientsData = {
  clients: MasterClientListItem[];
};

async function loadCardSummaries(providerId: string, clients: Map<string, { clientUserId: string | null; phone: string }>) {
  const userIds = Array.from(new Set(Array.from(clients.values()).map((item) => item.clientUserId).filter(Boolean))) as string[];
  const phones = Array.from(new Set(Array.from(clients.values()).map((item) => item.phone).filter(Boolean)));
  if (userIds.length === 0 && phones.length === 0) return new Map<string, ClientCardSummary>();

  const orFilters: Prisma.ClientCardWhereInput[] = [];
  if (userIds.length > 0) orFilters.push({ clientUserId: { in: userIds } });
  if (phones.length > 0) orFilters.push({ clientPhone: { in: phones } });

  const cards = await prisma.clientCard.findMany({
    where: {
      providerId,
      OR: orFilters,
    },
    select: {
      id: true,
      clientUserId: true,
      clientPhone: true,
      tags: true,
      notes: true,
      _count: { select: { photos: true } },
    },
  });

  const map = new Map<string, ClientCardSummary>();
  for (const card of cards) {
    const key = card.clientUserId ? `user:${card.clientUserId}` : card.clientPhone ? `phone:${card.clientPhone}` : null;
    if (!key) continue;
    map.set(key, {
      id: card.id,
      tags: card.tags,
      hasNotes: Boolean(card.notes?.trim()),
      photosCount: card._count.photos,
    });
  }
  return map;
}

function sortClients(
  sort: "recent" | "visits" | "alpha" | undefined,
  a: { lastBookingAt: Date; visitsCount: number; displayName: string },
  b: { lastBookingAt: Date; visitsCount: number; displayName: string }
): number {
  if (sort === "visits") {
    if (b.visitsCount !== a.visitsCount) return b.visitsCount - a.visitsCount;
    return b.lastBookingAt.getTime() - a.lastBookingAt.getTime();
  }
  if (sort === "alpha") {
    return a.displayName.localeCompare(b.displayName, "ru");
  }
  return b.lastBookingAt.getTime() - a.lastBookingAt.getTime();
}

export async function getMasterClients(
  providerId: string,
  sort?: "recent" | "visits" | "alpha",
  includeCardSummary = false
): Promise<MasterClientsData> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, timezone: true },
  });
  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ providerId }, { masterProviderId: providerId }],
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
    },
    select: {
      id: true,
      status: true,
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
          price: true,
        },
      },
      serviceItems: {
        select: { titleSnapshot: true, priceSnapshot: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ startAtUtc: "desc" }, { createdAt: "desc" }],
  });

  const grouped = groupBookings(bookings as BookingClientRow[]);

  const userIds = Array.from(
    new Set(Array.from(grouped.values()).map((item) => item.clientUserId).filter(Boolean))
  ) as string[];
  if (userIds.length > 0) {
    const profiles = await prisma.userProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true },
    });
    applyProfileNames(grouped, profiles);
  }

  const cardMap = includeCardSummary ? await loadCardSummaries(providerId, grouped) : new Map();

  const clients = Array.from(grouped.values())
    .sort((a, b) => sortClients(sort, a, b))
    // TODO: добавить курсорную пагинацию для длинных списков клиентов.
    .slice(0, 50)
    .map((item) => ({
      key: item.key,
      clientUserId: item.clientUserId,
      displayName: item.displayName,
      phone: item.phone,
      lastBookingAt: item.lastBookingAt.toISOString(),
      lastVisitAt: item.lastVisitAt ? item.lastVisitAt.toISOString() : null,
      daysSinceLastVisit: calculateDaysSinceLastVisit(item.lastVisitAt, provider.timezone),
      lastServiceName: item.lastServiceName,
      visitsCount: item.visitsCount,
      totalAmount: item.totalAmount,
      card: includeCardSummary ? cardMap.get(item.key) ?? null : null,
    }));

  return { clients };
}
