import type { BookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateDaysSinceLastVisit } from "@/lib/crm/clients";
import {
  buildPhoneVariants,
  parseClientKeyOrThrow,
  resolveBookingAmount,
  resolveBookingDate,
  resolveServiceTitle,
  type BookingHistoryRow,
} from "@/lib/crm/card-utils";

export type ClientCardPhotoDto = {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
};

export type ClientCardDto = {
  id: string | null;
  notes: string | null;
  tags: string[];
  photos: ClientCardPhotoDto[];
};

export type ClientHistoryItem = {
  bookingId: string;
  date: string;
  serviceName: string;
  amount: number;
  status: BookingStatus;
};

export type ClientCardData = {
  card: ClientCardDto;
  history: ClientHistoryItem[];
  visitsCount: number;
  daysSinceLastVisit: number | null;
};

type ClientIdentity = {
  clientUserId: string | null;
  clientPhone: string | null;
};

export function parseClientKeyIdentity(clientKey: string): {
  identity: ClientIdentity;
  phoneVariants: string[];
} {
  const parsed = parseClientKeyOrThrow(clientKey);
  if (parsed.type === "user") {
    return { identity: { clientUserId: parsed.value, clientPhone: null }, phoneVariants: [] };
  }
  const variants = buildPhoneVariants(parsed.value);
  return { identity: { clientUserId: null, clientPhone: parsed.value }, phoneVariants: variants };
}

export async function getClientCardData(input: {
  providerId: string;
  timeZone: string;
  bookingWhere: Prisma.BookingWhereInput;
  clientKey: string;
}): Promise<ClientCardData> {
  const { identity, phoneVariants } = parseClientKeyIdentity(input.clientKey);
  const card = await prisma.clientCard.findFirst({
    where: {
      providerId: input.providerId,
      ...(identity.clientUserId ? { clientUserId: identity.clientUserId } : { clientPhone: identity.clientPhone }),
    },
    include: {
      photos: {
        include: { mediaAsset: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const cardDto: ClientCardDto = card
    ? {
        id: card.id,
        notes: card.notes ?? null,
        tags: card.tags,
        photos: card.photos.map((photo) => ({
          id: photo.id,
          caption: photo.caption ?? null,
          url: `/api/media/file/${photo.mediaAssetId}`,
          createdAt: photo.createdAt.toISOString(),
        })),
      }
    : { id: null, notes: null, tags: [], photos: [] };

  const clientFilter = identity.clientUserId
    ? { clientUserId: identity.clientUserId }
    : {
        OR: [
          { clientPhone: { in: phoneVariants } },
          { clientPhoneSnapshot: { in: phoneVariants } },
        ],
      };

  const bookings = await prisma.booking.findMany({
    where: { AND: [input.bookingWhere, clientFilter] },
    select: {
      id: true,
      status: true,
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

  let visitsCount = 0;
  let lastVisitAt: Date | null = null;
  const history = (bookings as BookingHistoryRow[]).map((booking) => {
    const date = resolveBookingDate(booking);
    if (booking.status === "FINISHED") {
      visitsCount += 1;
      if (!lastVisitAt || date.getTime() > lastVisitAt.getTime()) {
        lastVisitAt = date;
      }
    }
    return {
      bookingId: booking.id,
      date: date.toISOString(),
      serviceName: resolveServiceTitle(booking),
      amount: resolveBookingAmount(booking),
      status: booking.status,
    };
  });

  return {
    card: cardDto,
    history,
    visitsCount,
    daysSinceLastVisit: calculateDaysSinceLastVisit(lastVisitAt, input.timeZone),
  };
}

export async function upsertClientCard(input: {
  providerId: string;
  clientKey: string;
  notes?: string | null;
  tags?: string[];
}) {
  const { identity } = parseClientKeyIdentity(input.clientKey);
  const existing = await prisma.clientCard.findFirst({
    where: {
      providerId: input.providerId,
      ...(identity.clientUserId ? { clientUserId: identity.clientUserId } : { clientPhone: identity.clientPhone }),
    },
  });

  const data: Prisma.ClientCardUpdateInput = {};
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.tags !== undefined) data.tags = input.tags;

  if (existing) {
    if (Object.keys(data).length === 0) {
      return { id: existing.id, notes: existing.notes, tags: existing.tags };
    }
    return prisma.clientCard.update({
      where: { id: existing.id },
      data,
      select: { id: true, notes: true, tags: true },
    });
  }

  return prisma.clientCard.create({
    data: {
      providerId: input.providerId,
      clientUserId: identity.clientUserId,
      clientPhone: identity.clientPhone,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
    },
    select: { id: true, notes: true, tags: true },
  });
}

export async function ensureClientCard(input: { providerId: string; clientKey: string }) {
  const { identity } = parseClientKeyIdentity(input.clientKey);
  const existing = await prisma.clientCard.findFirst({
    where: {
      providerId: input.providerId,
      ...(identity.clientUserId ? { clientUserId: identity.clientUserId } : { clientPhone: identity.clientPhone }),
    },
  });
  if (existing) return existing;
  return prisma.clientCard.create({
    data: {
      providerId: input.providerId,
      clientUserId: identity.clientUserId,
      clientPhone: identity.clientPhone,
      notes: null,
      tags: [],
    },
  });
}
