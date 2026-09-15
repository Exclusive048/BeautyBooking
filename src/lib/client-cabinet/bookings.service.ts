import { BookingStatus, type ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversationSlug } from "@/lib/chat/conversation-slug";
import { canLeaveReview } from "@/lib/reviews/can-leave";
import { classifyClientBookingGroup } from "@/lib/client-cabinet/booking-classification";
import { toLocalDateKey } from "@/lib/schedule/timezone";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

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
  /**
   * RESCHEDULE-CLIENT-APPROVAL: двустороннее согласование переноса (инв. #32).
   * `proposedStartAt`/`proposedEndAt` — предложенное окно (только при
   * CHANGE_REQUESTED), `actionRequiredBy` — чей сейчас ход: `CLIENT` — мастер
   * предложил и ждёт ответа клиента, `MASTER` — клиент попросил и ждёт мастера.
   */
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /** Maps action shows when address exists and viewing is master-on-site */
  isOnSite: boolean;
  address: string | null;
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    type: ProviderType;
    avatarUrl: string | null;
    /** QA-107/FIX-22: salon (entity) timezone — client surfaces render the time
     * in THIS zone, never the viewer's host tz, with an explicit zone label. */
    timezone: string;
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
    // FIX-20 (Item 2): salon tz so the «Ближайшая» tile renders the salon-tz
    // time + relative day (matching the list), not the viewer/host tz.
    timeZone: string;
  } | null;
  finishedCount: number;
  spentLast90dKopeks: number;
};

export type ClientBookingsPayload = {
  bookings: ClientBookingDTO[];
  kpi: ClientBookingsKpi;
};

export async function listClientBookings(
  userId: string,
  filter: ClientBookingFilter = {},
): Promise<ClientBookingsPayload> {
  const now = new Date();
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
      proposedStartAt: true,
      proposedEndAt: true,
      actionRequiredBy: true,
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
          timezone: true,
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
          timezone: true,
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
    // Salon tz of the master who'll do the work (falls back to the booked
    // provider). Drives QA-107 salon-tz rendering + zone label.
    const salonTz = displayProvider.timezone ?? r.provider.timezone;
    const start = r.startAtUtc;
    const end = r.endAtUtc;
    // FIX-EXP-013: datetime-aware classification via the canonical
    // runtime-finished cutoff — an elapsed-but-not-FINISHED booking is history,
    // not "upcoming". Reuses `resolveBookingRuntimeStatus` (same predicate as
    // canReview / can-leave); instant-based, so the entity-tz is irrelevant here.
    const group = classifyClientBookingGroup({
      status: r.status,
      startAtUtc: start,
      endAtUtc: end,
      now,
    });
    // FIX-20 (Item 2): "today" in the SALON's tz (not host/server tz) so the
    // «Сегодня» badge/highlight matches the salon-tz time shown in the list.
    const isToday =
      !!start && toLocalDateKey(start, salonTz) === toLocalDateKey(now, salonTz);
    const serviceItem = r.serviceItems[0];
    const titleSnapshot = serviceItem?.titleSnapshot ?? r.service.name;
    const priceSnapshot = serviceItem?.priceSnapshot ?? r.service.price;
    const durationSnapshotMin = serviceItem?.durationSnapshotMin ?? r.service.durationMin;
    const hasReview = !!r.review;
    const isFinished = group === "finished";
    // FIX-R2-06-H: mirror the server can-leave gate exactly (runtime-FINISHED +
    // REVIEW_WINDOW_DAYS), so the button shows iff the server would 201.
    const canReview =
      !hasReview &&
      canLeaveReview({
        booking: {
          clientUserId: userId,
          status: r.status,
          startAtUtc: start,
          endAtUtc: end,
          service: { durationMin: r.service.durationMin },
        },
        currentUserId: userId,
        nowUtc: now,
      });

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
      proposedStartAt:
        r.status === "CHANGE_REQUESTED" && r.proposedStartAt ? r.proposedStartAt.toISOString() : null,
      proposedEndAt:
        r.status === "CHANGE_REQUESTED" && r.proposedEndAt ? r.proposedEndAt.toISOString() : null,
      actionRequiredBy: r.status === "CHANGE_REQUESTED" ? (r.actionRequiredBy ?? null) : null,
      isOnSite: !!address,
      address,
      provider: {
        id: displayProvider.id,
        name: displayProvider.name,
        publicUsername: displayProvider.publicUsername,
        type: displayProvider.type,
        avatarUrl: displayProvider.avatarUrl,
        timezone: salonTz,
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
        timeZone: upcomingDtos[0].provider.timezone,
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
