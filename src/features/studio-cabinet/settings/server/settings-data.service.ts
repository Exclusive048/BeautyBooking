import { MembershipStatus, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildYandexMapsUrl } from "@/lib/maps/yandex";
import { getStudioCatalogCoverAssetId } from "@/lib/studios/catalog-cover";
import type {
  StudioSettingsData,
  StudioSettingsScope,
  StudioTeamMember,
} from "../lib/types";

/**
 * STUDIO-SETTINGS-A — loads everything needed to render the studio
 * settings page in a single round-trip.
 *
 * Scope rules:
 *   OWNER  → full access + danger zone
 *   ADMIN  → settings access, no danger zone (archive/delete hidden)
 *   MASTER → not admitted (route gated upstream via
 *            `resolveCurrentStudioAccess`; we double-check here)
 *
 * Falls back to a conservative "no scope" if the user has no active
 * membership in the studio — the route handler then redirects to /403.
 */
export async function loadStudioSettingsData(input: {
  studioId: string;
  currentUserId: string;
}): Promise<StudioSettingsData | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: {
      id: true,
      providerId: true,
      ownerUserId: true,
      provider: {
        select: {
          id: true,
          name: true,
          tagline: true,
          description: true,
          avatarUrl: true,
          isPublished: true,
          timezone: true,
          address: true,
          district: true,
          geoLat: true,
          geoLng: true,
          city: { select: { name: true } },
          minBookingHoursAhead: true,
          maxBookingDaysAhead: true,
          cancellationDeadlineHours: true,
          lateCancelAction: true,
          acceptNewClients: true,
          remindersEnabled: true,
        },
      },
    },
  });
  if (!studio) return null;

  // Memberships drive both scope (current user) + team display (others).
  const memberships = await prisma.studioMembership.findMany({
    where: { studioId: studio.id, status: MembershipStatus.ACTIVE },
    select: {
      userId: true,
      roles: true,
      user: {
        select: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  const currentMembership = memberships.find((m) => m.userId === input.currentUserId);
  const directOwner = studio.ownerUserId === input.currentUserId;
  const isOwner = directOwner || (currentMembership?.roles.includes(StudioRole.OWNER) ?? false);
  const isAdmin = isOwner || (currentMembership?.roles.includes(StudioRole.ADMIN) ?? false);

  const scope: StudioSettingsScope = {
    isOwner,
    isAdmin,
    roles: currentMembership?.roles ?? (directOwner ? [StudioRole.OWNER] : []),
    canDanger: isOwner,
  };

  // Team breakdown: pick out the owner + other admins. Masters are NOT
  // surfaced here — STUDIO-MASTERS-A owns the per-master roster page.
  const ownerMembership =
    memberships.find((m) => m.roles.includes(StudioRole.OWNER)) ??
    memberships.find((m) => m.userId === studio.ownerUserId) ??
    null;
  const owner: StudioTeamMember | null = ownerMembership
    ? memberToTeam(ownerMembership, input.currentUserId)
    : null;
  const admins: StudioTeamMember[] = memberships
    .filter(
      (m) =>
        m.userId !== ownerMembership?.userId &&
        m.roles.includes(StudioRole.ADMIN),
    )
    .map((m) => memberToTeam(m, input.currentUserId));

  const [pushCount, catalogCoverAssetId] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId: input.currentUserId } }),
    getStudioCatalogCoverAssetId(studio.providerId),
  ]);

  const mapUrl = buildYandexMapsUrl({
    address: studio.provider.address ?? undefined,
    lat: studio.provider.geoLat ?? undefined,
    lon: studio.provider.geoLng ?? undefined,
  });

  return {
    scope,
    general: {
      studioId: studio.id,
      providerId: studio.providerId,
      name: studio.provider.name,
      tagline: studio.provider.tagline ?? "",
      description: studio.provider.description ?? null,
      avatarUrl: studio.provider.avatarUrl ?? null,
      isPublished: studio.provider.isPublished,
      timezone: studio.provider.timezone,
      catalogCoverAssetId,
      address: {
        cityName: studio.provider.city?.name ?? null,
        address: studio.provider.address ?? null,
        district: studio.provider.district ?? null,
        geoLat: studio.provider.geoLat ?? null,
        geoLng: studio.provider.geoLng ?? null,
        mapUrl,
      },
    },
    team: { owner, admins },
    notifications: { pushEnabled: pushCount > 0 },
    policy: {
      minBookingHoursAhead: studio.provider.minBookingHoursAhead,
      maxBookingDaysAhead: studio.provider.maxBookingDaysAhead,
      cancellationDeadlineHours: studio.provider.cancellationDeadlineHours,
      lateCancelAction: studio.provider.lateCancelAction,
      acceptNewClients: studio.provider.acceptNewClients,
      remindersEnabled: studio.provider.remindersEnabled,
    },
  };
}

function memberToTeam(
  membership: {
    userId: string;
    roles: StudioRole[];
    user: {
      id: string;
      displayName: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
    };
  },
  currentUserId: string,
): StudioTeamMember {
  const fullName =
    membership.user.displayName?.trim() ||
    `${membership.user.firstName ?? ""} ${membership.user.lastName ?? ""}`.trim() ||
    "Член команды";
  return {
    userId: membership.userId,
    displayName: fullName,
    email: membership.user.email ?? null,
    phone: membership.user.phone ?? null,
    roles: membership.roles,
    isCurrentUser: membership.userId === currentUserId,
  };
}
