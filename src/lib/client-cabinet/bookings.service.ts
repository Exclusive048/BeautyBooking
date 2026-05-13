import { BookingStatus, type ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversationSlug } from "@/lib/chat/conversation-slug";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const FINISHED_STATUSES: BookingStatus[] = [BookingStatus.FINISHED];
const CANCELLED_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.NO_SHOW,
];

export type ClientBookingFilter = {
  status?: "all" | "upcoming" | "finished" | "cancelled";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ClientBookingDTO = {
  id: string;
  status: BookingStatus;
  startAtUtc: string | null;
  endAtUtc: string | null;
  durationMin: number;
  slotLabel: string;
  isUpcoming: boolean;
  isFinished: boolean;
  isCancelled: boolean;
  isToday: boolean;
  canReview: boolean;
  hasReview: boolean;
  chatSlug: string | null;
  /** Maps action shows when address exists and viewing is master-on-site */
  isOnSite: boolean;
  address: string | null;
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    type: ProviderType;
    avatarUrl: string | null;
  };
  service: {
    id: string;
    name: string;
    priceSnapshot: number;
    durationSnapshotMin: number;
  };
};

export type ClientBookingsKpi = {
  totalCount: number;
  upcomingNext: {
    whenIso: string;
    providerName: string;
    serviceName: string;
  } | null;
  finishedCount: number;
  spentLast90dKopeks: number;
};

export type ClientBookingsPayload = {
  bookings: ClientBookingDTO[];
  kpi: ClientBookingsKpi;
};

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfTodayUtc(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function statusGroup(status: BookingStatus): "upcoming" | "finished" | "cancelled" {
  if (FINISHED_STATUSES.includes(status)) return "finished";
  if (CANCELLED_STATUSES.includes(status)) return "cancelled";
  return "upcoming";
}

export async function listClientBookings(
  userId: string,
  filter: ClientBookingFilter = {},
): Promise<ClientBookingsPayload> {
  const now = new Date();
  const todayStart = startOfTodayUtc();
  const todayEnd = endOfTodayUtc();
  const fourteenDaysAgo = new Date(Date.now() - FOURTEEN_DAYS_MS);
  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  const rows = await prisma.booking.findMany({
    where: { clientUserId: userId },
    orderBy: { startAtUtc: "desc" },
    take: 300,
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      slotLabel: true,
      providerId: true,
      service: {
        select: { id: true, name: true, price: true, durationMin: true },
      },
      provider: {
        select: {
          id: true,
          name: true,
          publicUsername: true,
          type: true,
          avatarUrl: true,
          address: true,
        },
      },
      masterProvider: {
        select: {
          id: true,
          name: true,
          publicUsername: true,
          type: true,
          avatarUrl: true,
          address: true,
        },
      },
      serviceItems: {
        select: { titleSnapshot: true, priceSnapshot: true, durationSnapshotMin: true },
        take: 1,
      },
      review: { select: { id: true } },
    },
  });

  // Conversation slug resolution. One round trip per unique providerId so a
  // long history of bookings with the same master only pays once.
  const uniqueProviderIds = Array.from(new Set(rows.map((r) => r.providerId)));
  const slugByProvider = new Map<string, string>();
  await Promise.all(
    uniqueProviderIds.map(async (providerId) => {
      try {
        const slug = await getOrCreateConversationSlug({ providerId, clientUserId: userId });
        slugByProvider.set(providerId, slug);
      } catch {
        /* swallow — chat link just hides if slug fails */
      }
    }),
  );

  const dtos: ClientBookingDTO[] = rows.map((r) => {
    // For studio bookings the customer-facing provider in chat/profile is the
    // master who'll actually do the work — fall back to the studio provider
    // when no master is assigned yet (NEW/PENDING).
    const displayProvider = r.masterProvider ?? r.provider;
    const start = r.startAtUtc;
    const end = r.endAtUtc;
    const group = statusGroup(r.status);
    const isToday =
      !!start && start.getTime() >= todayStart.getTime() && start.getTime() <= todayEnd.getTime();
    const serviceItem = r.serviceItems[0];
    const titleSnapshot = serviceItem?.titleSnapshot ?? r.service.name;
    const priceSnapshot = serviceItem?.priceSnapshot ?? r.service.price;
    const durationSnapshotMin = serviceItem?.durationSnapshotMin ?? r.service.durationMin;
    const hasReview = !!r.review;
    const isFinished = group === "finished";
    const canReview =
      isFinished &&
      !hasReview &&
      !!end &&
      end.getTime() >= fourteenDaysAgo.getTime();

    const address = displayProvider.address ?? r.provider.address ?? null;

    return {
      id: r.id,
      status: r.status,
      startAtUtc: start?.toISOString() ?? null,
      endAtUtc: end?.toISOString() ?? null,
      durationMin: durationSnapshotMin,
      slotLabel: r.slotLabel,
      isUpcoming: group === "upcoming",
      isFinished,
      isCancelled: group === "cancelled",
      isToday,
      canReview,
      hasReview,
      chatSlug: slugByProvider.get(displayProvider.id) ?? null,
      isOnSite: !!address,
      address,
      provider: {
        id: displayProvider.id,
        name: displayProvider.name,
        publicUsername: displayProvider.publicUsername,
        type: displayProvider.type,
        avatarUrl: displayProvider.avatarUrl,
      },
      service: {
        id: r.service.id,
        name: titleSnapshot,
        priceSnapshot,
        durationSnapshotMin,
      },
    };
  });

  // Filter
  const filtered = dtos.filter((b) => {
    if (filter.status && filter.status !== "all") {
      if (filter.status === "upcoming" && !b.isUpcoming) return false;
      if (filter.status === "finished" && !b.isFinished) return false;
      if (filter.status === "cancelled" && !b.isCancelled) return false;
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const hay = `${b.provider.name} ${b.service.name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter.dateFrom && b.startAtUtc) {
      if (new Date(b.startAtUtc) < new Date(filter.dateFrom)) return false;
    }
    if (filter.dateTo && b.startAtUtc) {
      if (new Date(b.startAtUtc) > new Date(filter.dateTo)) return false;
    }
    return true;
  });

  // Sort: upcoming ASC by start, then finished DESC, cancelled last by start DESC
  filtered.sort((a, b) => {
    const groupA = a.isUpcoming ? 0 : a.isFinished ? 1 : 2;
    const groupB = b.isUpcoming ? 0 : b.isFinished ? 1 : 2;
    if (groupA !== groupB) return groupA - groupB;
    const aTime = a.startAtUtc ? new Date(a.startAtUtc).getTime() : 0;
    const bTime = b.startAtUtc ? new Date(b.startAtUtc).getTime() : 0;
    if (a.isUpcoming) return aTime - bTime;
    return bTime - aTime;
  });

  // KPI — compute over the unfiltered set
  const upcomingDtos = dtos
    .filter((b) => b.isUpcoming && b.startAtUtc && new Date(b.startAtUtc) >= now)
    .sort(
      (a, b) =>
        new Date(a.startAtUtc!).getTime() - new Date(b.startAtUtc!).getTime(),
    );
  const finishedCount = dtos.filter((b) => b.isFinished).length;
  const spentLast90dKopeks = dtos
    .filter(
      (b) =>
        b.isFinished &&
        b.startAtUtc &&
        new Date(b.startAtUtc) >= ninetyDaysAgo,
    )
    .reduce((sum, b) => sum + b.service.priceSnapshot, 0);

  const upcomingNext = upcomingDtos[0]
    ? {
        whenIso: upcomingDtos[0].startAtUtc!,
        providerName: upcomingDtos[0].provider.name,
        serviceName: upcomingDtos[0].service.name,
      }
    : null;

  const kpi: ClientBookingsKpi = {
    totalCount: dtos.length,
    upcomingNext,
    finishedCount,
    spentLast90dKopeks,
  };

  return { bookings: filtered, kpi };
}
