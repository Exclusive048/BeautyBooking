import {
  BookingStatus,
  MembershipStatus,
  ProviderType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StudioMasterDisplayStatus } from "../lib/status-display";
import type {
  StudioMasterFilter,
  StudioMasterListItem,
  StudioMastersListData,
} from "./types";

const COMPLETED_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
];

const DAILY_CAPACITY = 5;

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveBookingRevenueKopeks(booking: {
  service: { price: number } | null;
  serviceItems: Array<{ priceSnapshot: number }>;
}): number {
  const snapshotSum = booking.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.priceSnapshot),
    0,
  );
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, booking.service?.price ?? 0);
}

function deriveStatus(input: {
  hasOwner: boolean;
  isPublished: boolean;
  hasPendingInvite: boolean;
}): StudioMasterDisplayStatus {
  if (input.hasPendingInvite) return "INVITED";
  if (!input.hasOwner) return "INVITED";
  return input.isPublished ? "ACTIVE" : "DISABLED";
}

/**
 * Lists all masters under a studio with derived display status, metrics
 * over the last 30 days, and filter counts. Status is derived from
 * `Provider.ownerUserId` + `Provider.isPublished` + pending
 * `StudioInvite` for that provider's phone — matching the existing
 * `listStudioMasters` semantics (no schema change). Counts always
 * cover the full studio; `items` is the filtered subset.
 */
export async function loadStudioMastersList(input: {
  studioId: string;
  currentUserId: string;
  filter: StudioMasterFilter;
  search?: string;
}): Promise<StudioMastersListData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    return {
      items: [],
      counts: { total: 0, active: 0, invited: 0, disabled: 0 },
    };
  }

  const todayStart = startOfUtcDay(new Date());
  const periodStart = addUtcDays(todayStart, -29);
  const periodEnd = addUtcDays(todayStart, 1);

  const [providers, pendingInvites, bookings] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: studio.providerId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tagline: true,
        contactPhone: true,
        isPublished: true,
        ownerUserId: true,
        ratingAvg: true,
        ratingCount: true,
        owner: {
          select: { displayName: true, firstName: true, lastName: true },
        },
        masterServices: {
          where: { isEnabled: true },
          take: 3,
          orderBy: { createdAt: "asc" },
          select: { service: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.studioInvite.findMany({
      where: { studioId: studio.id, status: MembershipStatus.PENDING },
      select: { phone: true },
    }),
    prisma.booking.findMany({
      where: {
        OR: [
          { studioId: studio.id },
          { providerId: studio.providerId },
        ],
        startAtUtc: { gte: periodStart, lt: periodEnd },
        status: { in: COMPLETED_STATUSES },
      },
      select: {
        masterProviderId: true,
        providerId: true,
        service: { select: { price: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
    }),
  ]);

  const pendingPhones = new Set(pendingInvites.map((invite) => invite.phone));

  type Totals = { revenueKopeks: number; bookings: number };
  const totalsByMaster = new Map<string, Totals>();
  for (const booking of bookings) {
    const masterId = booking.masterProviderId ?? booking.providerId;
    const entry = totalsByMaster.get(masterId) ?? { revenueKopeks: 0, bookings: 0 };
    entry.revenueKopeks += resolveBookingRevenueKopeks(booking);
    entry.bookings += 1;
    totalsByMaster.set(masterId, entry);
  }

  const allItems: StudioMasterListItem[] = providers.map((provider) => {
    const hasOwner = Boolean(provider.ownerUserId);
    const hasPendingInvite =
      Boolean(provider.contactPhone) && pendingPhones.has(provider.contactPhone!);
    const status = deriveStatus({
      hasOwner,
      isPublished: provider.isPublished,
      hasPendingInvite,
    });

    const ownerName =
      provider.owner?.displayName?.trim() ||
      [provider.owner?.firstName?.trim(), provider.owner?.lastName?.trim()]
        .filter(Boolean)
        .join(" ");
    const displayName = ownerName || provider.name;

    const servicesSummary =
      provider.masterServices
        .map((entry) => entry.service.name)
        .filter(Boolean)
        .join(" · ") || provider.tagline || "";

    const totals = totalsByMaster.get(provider.id) ?? { revenueKopeks: 0, bookings: 0 };
    const occupancyDenominator = 30 * DAILY_CAPACITY;
    const occupancy = Math.min(
      Math.round((totals.bookings / occupancyDenominator) * 100),
      100,
    );

    return {
      id: provider.id,
      providerId: provider.id,
      userId: provider.ownerUserId ?? null,
      displayName,
      avatarUrl: provider.avatarUrl ?? null,
      servicesSummary,
      status,
      isCurrentUser: provider.ownerUserId === input.currentUserId,
      metrics: {
        revenue30dKopeks: totals.revenueKopeks,
        bookings30d: totals.bookings,
        occupancy30dPercent: occupancy,
        rating: provider.ratingAvg ?? 0,
        reviewsCount: provider.ratingCount ?? 0,
      },
    };
  });

  const counts = {
    total: allItems.length,
    active: allItems.filter((item) => item.status === "ACTIVE").length,
    invited: allItems.filter((item) => item.status === "INVITED").length,
    disabled: allItems.filter((item) => item.status === "DISABLED").length,
  };

  const search = input.search?.trim().toLowerCase() ?? "";
  const filteredByStatus = allItems.filter((item) => {
    switch (input.filter) {
      case "active":
        return item.status === "ACTIVE";
      case "invited":
        return item.status === "INVITED";
      case "disabled":
        return item.status === "DISABLED";
      default:
        return true;
    }
  });
  const items =
    search.length === 0
      ? filteredByStatus
      : filteredByStatus.filter(
          (item) =>
            item.displayName.toLowerCase().includes(search) ||
            item.servicesSummary.toLowerCase().includes(search),
        );

  return { items, counts };
}
