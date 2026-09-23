import {
  BookingStatus,
  MembershipStatus,
  ProviderType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { signStudioMasterViewToken } from "@/lib/studio/master-view-token";
import type { StudioMasterDisplayStatus } from "../lib/status-display";
import { getMasterWeekOccupancy } from "../lib/week-occupancy";
import type { StudioMasterDetail, StudioMasterListItem } from "./types";

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
  /** STUDIO-PAUSE-SPLIT-01: пауза в студии, а не личная видимость мастера. */
  studioPaused: boolean;
  hasPendingInvite: boolean;
}): StudioMasterDisplayStatus {
  if (input.hasPendingInvite) return "INVITED";
  if (!input.hasOwner) return "INVITED";
  return input.studioPaused ? "DISABLED" : "ACTIVE";
}

/**
 * Detail payload for the right-hand panel on `/cabinet/studio/team`.
 * Returns `null` when the master is not a member of this studio
 * (defensive — page route also guards via studioId scope).
 */
export async function loadStudioMasterDetail(input: {
  studioId: string;
  masterId: string;
  currentUserId: string;
}): Promise<StudioMasterDetail | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) return null;

  // STUDIO-POLISH-A #4: `masterId` may be a cuid OR a `publicUsername`
  // (the masters list URL prefers the public handle when available, so
  // shared/bookmarked links may carry either). Resolve both shapes in a
  // single query so the page-route handler stays simple.
  const provider = await prisma.provider.findFirst({
    where: {
      OR: [{ id: input.masterId }, { publicUsername: input.masterId }],
      type: ProviderType.MASTER,
      studioId: studio.providerId,
    },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      tagline: true,
      description: true,
      contactPhone: true,
      contactEmail: true,
      publicUsername: true,
      studioPaused: true,
      ownerUserId: true,
      ratingAvg: true,
      ratingCount: true,
      createdAt: true,
      owner: {
        select: {
          displayName: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
      masterServices: {
        where: { isEnabled: true },
        take: 6,
        orderBy: { createdAt: "asc" },
        select: { service: { select: { name: true } } },
      },
    },
  });
  if (!provider) return null;

  const todayStart = startOfUtcDay(new Date());
  const periodStart = addUtcDays(todayStart, -29);
  const periodEnd = addUtcDays(todayStart, 1);

  const [periodBookings, allTimeClients, pendingInvite, weekSchedule, membership] =
    await Promise.all([
      prisma.booking.findMany({
        where: {
          OR: [
            { providerId: provider.id },
            { masterProviderId: provider.id },
          ],
          startAtUtc: { gte: periodStart, lt: periodEnd },
          status: { in: COMPLETED_STATUSES },
        },
        select: {
          service: { select: { price: true } },
          serviceItems: { select: { priceSnapshot: true } },
        },
      }),
      prisma.booking.findMany({
        where: {
          OR: [
            { providerId: provider.id },
            { masterProviderId: provider.id },
          ],
          status: { in: COMPLETED_STATUSES },
          clientUserId: { not: null },
        },
        select: { clientUserId: true },
        distinct: ["clientUserId"],
      }),
      // STUDIO-INVITE-EMAIL-01: приглашение ищется по любому из двух контактов.
      provider.contactPhone || provider.contactEmail
        ? prisma.studioInvite.findFirst({
            where: {
              studioId: studio.id,
              status: MembershipStatus.PENDING,
              OR: [
                ...(provider.contactPhone ? [{ phone: provider.contactPhone }] : []),
                ...(provider.contactEmail ? [{ email: provider.contactEmail }] : []),
              ],
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      getMasterWeekOccupancy({ providerId: provider.id }),
      provider.ownerUserId
        ? prisma.studioMembership.findFirst({
            where: { userId: provider.ownerUserId, studioId: studio.id },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ]);

  const revenue = periodBookings.reduce(
    (sum, booking) => sum + resolveBookingRevenueKopeks(booking),
    0,
  );
  const bookingsCount = periodBookings.length;
  const averageCheck =
    bookingsCount > 0 ? Math.round(revenue / bookingsCount) : 0;
  const occupancy = Math.min(
    Math.round((bookingsCount / (30 * DAILY_CAPACITY)) * 100),
    100,
  );

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

  const status = deriveStatus({
    hasOwner: Boolean(provider.ownerUserId),
    studioPaused: provider.studioPaused,
    hasPendingInvite: Boolean(pendingInvite),
  });

  const phoneRaw = provider.owner?.phone ?? provider.contactPhone ?? null;
  const phone = phoneRaw ? normalizeRussianPhone(phoneRaw) ?? phoneRaw : null;
  const email = provider.owner?.email ?? provider.contactEmail ?? null;

  const joinedAtDate = membership?.createdAt ?? provider.createdAt;
  const publicProfileUrl = provider.publicUsername
    ? `/u/${provider.publicUsername}`
    : null;

  const baseItem: StudioMasterListItem = {
    id: provider.id,
    providerId: provider.id,
    urlHandle: provider.publicUsername ?? provider.id,
    userId: provider.ownerUserId ?? null,
    displayName,
    avatarUrl: provider.avatarUrl ?? null,
    servicesSummary,
    status,
    isCurrentUser: provider.ownerUserId === input.currentUserId,
    metrics: {
      revenue30dKopeks: revenue,
      bookings30d: bookingsCount,
      occupancy30dPercent: occupancy,
      rating: provider.ratingAvg ?? 0,
      reviewsCount: provider.ratingCount ?? 0,
    },
  };

  return {
    ...baseItem,
    profile: {
      name: provider.name,
      tagline: provider.tagline ?? "",
      description: provider.description ?? "",
    },
    phone,
    email,
    joinedAt: joinedAtDate.toISOString(),
    publicProfileUrl,
    clientsCount: allTimeClients.length,
    averageCheckKopeks: averageCheck,
    weekSchedule,
    // STUDIO-MASTERS-PRIVACY-FIX-A: pre-sign the calendar deep-link
    // token here. The provider row was resolved by cuid OR
    // publicUsername (see comment above), so `provider.id` is the
    // canonical id we sign — verifier decodes it back at the
    // calendar route. Studio scope is baked in so cross-studio
    // share-links don't work.
    viewToken: signStudioMasterViewToken({
      masterId: provider.id,
      studioId: input.studioId,
    }),
  };
}
