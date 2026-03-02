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

export type ClientsPageInput = {
  providerId: string;
  sort?: "recent" | "visits" | "alpha";
  includeCardSummary?: boolean;
  cursor?: string;
  limit?: number;
};

export type ClientsPageResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export type MasterClientsData = ClientsPageResult<MasterClientListItem>;

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

export async function getMasterClients(input: ClientsPageInput): Promise<MasterClientsData> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const provider = await prisma.provider.findUnique({
    where: { id: input.providerId },
    select: { id: true, type: true, timezone: true },
  });
  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ providerId: input.providerId }, { masterProviderId: input.providerId }],
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

  const includeCardSummary = input.includeCardSummary ?? false;
  const cardMap = includeCardSummary ? await loadCardSummaries(input.providerId, grouped) : new Map();

  const sortedClients = Array.from(grouped.values()).sort((a, b) => sortClients(input.sort, a, b));

  const cursorIndex =
    input.cursor === undefined
      ? -1
      : sortedClients.findIndex(
          (item) => item.key === input.cursor || (item.clientUserId && item.clientUserId === input.cursor)
        );
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const pageCandidates = sortedClients.slice(startIndex, startIndex + limit + 1);

  let nextCursor: string | null = null;
  if (pageCandidates.length > limit) {
    const cursorItem = pageCandidates[limit - 1];
    nextCursor = cursorItem.clientUserId ?? cursorItem.key;
    pageCandidates.pop();
  }

  const clients = pageCandidates.map((item) => ({
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

  return { items: clients, nextCursor };
}

