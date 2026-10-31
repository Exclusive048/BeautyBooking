import { MembershipStatus, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

/**
 * STUDIO-CHAT (запрос владельца 2026-10-31): переписка студии с клиентом.
 *
 * Пара переписки — (провайдер записи, клиент), а у записи студии провайдер —
 * сама студия (поверхность, инв. #45). Сторона студии в такой переписке — её
 * владелец и администраторы (OWNER / ADMIN): они читают и пишут ОТ ИМЕНИ
 * СТУДИИ (`senderName` — название студии, `senderType` — MASTER, сторона
 * провайдера). Мастер студии в этот круг не входит: инв. #26 расширен ровно
 * на администраторов студии записи, не на её команду.
 */

/** Кто пишет от имени студии этого провайдера: владелец и OWNER/ADMIN. */
export async function listStudioSideUserIds(studioProviderId: string): Promise<string[]> {
  const studio = await prisma.studio.findUnique({
    where: { providerId: studioProviderId },
    select: {
      ownerUserId: true,
      provider: { select: { ownerUserId: true } },
      memberships: {
        where: {
          status: MembershipStatus.ACTIVE,
          roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN] },
        },
        select: { userId: true },
      },
    },
  });
  if (!studio) return [];
  const ids = new Set<string>();
  if (studio.ownerUserId) ids.add(studio.ownerUserId);
  if (studio.provider.ownerUserId) ids.add(studio.provider.ownerUserId);
  for (const membership of studio.memberships) ids.add(membership.userId);
  return [...ids];
}

/** Пользователь — сторона студии этого провайдера (владелец или OWNER/ADMIN). */
export async function isStudioSideUser(userId: string, studioProviderId: string): Promise<boolean> {
  const ids = await listStudioSideUserIds(studioProviderId);
  return ids.includes(userId);
}

/**
 * Провайдер студии, от имени которой пишет пользователь в кабинете студии, —
 * та же студия, что выбирает кабинет (`resolveCurrentStudioAccess`). Мастеру
 * студии — 403: переписка студии только у администраторов.
 */
export async function resolveStudioChatProviderId(userId: string): Promise<string> {
  const access = await resolveCurrentStudioAccess(userId);
  const canAdminister =
    access.roles.includes(StudioRole.OWNER) || access.roles.includes(StudioRole.ADMIN);
  if (!canAdminister) {
    throw new AppError("Переписка студии доступна владельцу и администраторам.", 403, "FORBIDDEN");
  }
  return access.providerId;
}
