import { StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

/**
 * MOBILE-STUDIO-C — доступ к JSON-чтениям кабинета студии
 * (`/api/cabinet/studio/*`) для приложения.
 *
 * Студию выбирает `resolveCurrentStudioAccess` (как веб-кабинет: OWNER >
 * ADMIN > MASTER). У студии два id: `studioId` (Studio.id) — для записей,
 * блоков, услуг и всех `/api/studio/*`; `providerId` (Provider студии) — для
 * `/api/studios/{id}/**`, профилей мастеров студии и пояса салона.
 */
export type StudioCabinetAccess = {
  studioId: string;
  providerId: string;
  roles: StudioRole[];
  isOwner: boolean;
  /** Владелец или администратор — у мастера студии кабинета студии нет. */
  canAdminister: boolean;
  /** Пояс салона (IANA) — `Provider.timezone` студии. */
  timezone: string;
};

export const STUDIO_CABINET_FORBIDDEN_MESSAGE = "Этот раздел доступен владельцу студии.";

const DEFAULT_TIMEZONE = "Europe/Moscow";

export async function resolveStudioCabinetAccess(userId: string): Promise<StudioCabinetAccess> {
  const access = await resolveCurrentStudioAccess(userId);
  const provider = await prisma.provider.findUnique({
    where: { id: access.providerId },
    select: { timezone: true },
  });
  const isOwner = access.roles.includes(StudioRole.OWNER);
  return {
    studioId: access.studioId,
    providerId: access.providerId,
    roles: access.roles,
    isOwner,
    canAdminister: isOwner || access.roles.includes(StudioRole.ADMIN),
    timezone: provider?.timezone || DEFAULT_TIMEZONE,
  };
}

/** То же, но только владелец / администратор; мастеру студии — 403. */
export async function requireStudioCabinetAdmin(userId: string): Promise<StudioCabinetAccess> {
  const access = await resolveStudioCabinetAccess(userId);
  if (!access.canAdminister) {
    throw new AppError(STUDIO_CABINET_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
  }
  return access;
}
