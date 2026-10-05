import { MembershipStatus, StudioRole } from "@prisma/client";
import { getCurrentMasterProviderContext, listStudioMasterProfiles } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { studioMasterBlockingBookingsWhere } from "@/lib/studio/leave-guard";

/**
 * MOBILE-POLISH — «Вы работаете в составе студии» для кабинета мастера.
 *
 * После разделения профилей (STUDIO-MASTER-PROFILES) личный профиль мастера
 * всегда «соло» (`isSolo: true` в `GET /api/master/profile`), а работа в студии
 * — отдельная строка `Provider` с `studioId` студии. Признак членства поэтому
 * берётся не из личного профиля, а отсюда.
 *
 * Мастер работает в ОДНОЙ студии: приглашение в другую при активном профиле
 * студии отвергается (`invites/service.ts`, `MASTER_ALREADY_ASSIGNED`). Отсюда
 * форма — один объект или `null`, а не список.
 *
 * Профиль, который уходит из студии, выбирается так же, как у
 * `POST /api/cabinet/master/leave-studio`: профиль в студии, а до разделения
 * профилей — сам личный профиль со `studioId`. `blockingBookings` — будущие
 * записи студии у этого профиля, то же правило, по которому сервер откажет в
 * выходе (`leave-guard.ts`); `canLeave` — их нет.
 */

export type MasterStudioRole = "OWNER" | "ADMIN" | "MASTER";

export type MasterStudioMembership = {
  /** `Studio.id`. */
  studioId: string;
  /** `Provider.id` студии. */
  studioProviderId: string;
  studioName: string;
  /** Публичный адрес студии (`/u/{studioPublicUsername}`); `null` — ещё не выдан. */
  studioPublicUsername: string | null;
  studioAvatarUrl: string | null;
  /** Старшая роль в студии: OWNER > ADMIN > MASTER. */
  role: MasterStudioRole;
  /** Когда мастер вошёл в студию (UTC ISO): членство, иначе — создание профиля в студии. */
  joinedAt: string;
  /** `Provider.id` профиля мастера в студии (расписание `?profile=`). */
  studioProfileId: string;
  /** Будущие записи студии у мастера — пока они есть, выйти нельзя. */
  blockingBookings: number;
  canLeave: boolean;
};

function primaryRole(roles: StudioRole[] | undefined): MasterStudioRole {
  if (roles?.includes(StudioRole.OWNER)) return "OWNER";
  if (roles?.includes(StudioRole.ADMIN)) return "ADMIN";
  return "MASTER";
}

export async function loadMasterStudioMembership(
  userId: string,
  now: Date = new Date(),
): Promise<MasterStudioMembership | null> {
  const [personal, studioProfiles] = await Promise.all([
    getCurrentMasterProviderContext(userId),
    listStudioMasterProfiles(userId),
  ]);
  const profileId = studioProfiles[0]?.id ?? (personal.studioId ? personal.id : null);
  const studioProviderId = studioProfiles[0]?.studioProviderId ?? personal.studioId;
  if (!profileId || !studioProviderId) return null;

  const [studio, profile, blockingBookings] = await Promise.all([
    prisma.studio.findUnique({
      where: { providerId: studioProviderId },
      select: {
        id: true,
        provider: { select: { name: true, publicUsername: true, avatarUrl: true } },
      },
    }),
    prisma.provider.findUnique({ where: { id: profileId }, select: { createdAt: true } }),
    prisma.booking.count({ where: studioMasterBlockingBookingsWhere(studioProviderId, [profileId], now) }),
  ]);
  if (!studio) return null;

  const membership = await prisma.studioMembership.findUnique({
    where: { userId_studioId: { userId, studioId: studio.id } },
    select: { roles: true, status: true, createdAt: true },
  });
  const activeRoles = membership?.status === MembershipStatus.ACTIVE ? membership.roles : undefined;
  const joinedAt = membership?.createdAt ?? profile?.createdAt ?? now;

  return {
    studioId: studio.id,
    studioProviderId,
    studioName: studio.provider.name ?? "",
    studioPublicUsername: studio.provider.publicUsername ?? null,
    studioAvatarUrl: studio.provider.avatarUrl ?? null,
    role: primaryRole(activeRoles),
    joinedAt: joinedAt.toISOString(),
    studioProfileId: profileId,
    blockingBookings,
    canLeave: blockingBookings === 0,
  };
}
