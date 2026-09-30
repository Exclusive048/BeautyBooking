import "server-only";

import { StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { ensureStudioRole } from "@/lib/studio/access";
import { getCurrentMasterProviderContext, listStudioMasterProfiles } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";

/**
 * Кто правит расписание и чьё — общий разбор для роутов расписания кабинета
 * (`/api/cabinet/master/schedule` и `/pattern`). Вынесен из роута при
 * SCHEDULE-PATTERNS-01, чтобы у двух роутов не было двух копий правила доступа.
 *
 *   - `SOLO_MASTER` — мастер правит своё (личное) расписание, применяется сразу;
 *   - `STUDIO_MASTER` — мастер правит расписание своего профиля в студии
 *     (`?profile=`) — только заявкой студии;
 *   - `STUDIO_ADMIN` — владелец/админ студии правит расписание мастера своей
 *     студии (`?studioId=&masterId=`), применяется сразу.
 */
export type ScheduleActorMode = "SOLO_MASTER" | "STUDIO_ADMIN" | "STUDIO_MASTER";

export type ScheduleActorContext = {
  mode: ScheduleActorMode;
  providerId: string;
  studioProviderId: string | null;
  /**
   * STUDIO-MASTER-PROFILES (этап 4): расписание ПРОФИЛЯ В СТУДИИ (`?profile=`).
   * У него нет своей страницы — видимость страницы (`isPublished`) здесь не
   * пишется: она свойство личного профиля.
   */
  studioProfile?: boolean;
};

export async function resolveScheduleActor(req: Request, userId: string): Promise<ScheduleActorContext> {
  const url = new URL(req.url);
  const studioId = url.searchParams.get("studioId")?.trim() ?? "";
  const masterId = url.searchParams.get("masterId")?.trim() ?? "";
  const profileId = url.searchParams.get("profile")?.trim() ?? "";

  // STUDIO-MASTER-PROFILES (этап 4): свой профиль в студии — расписание
  // работы в студии; мастер предлагает его изменения заявкой студии.
  if (profileId && !studioId && !masterId) {
    const studioProfile = (await listStudioMasterProfiles(userId)).find((item) => item.id === profileId);
    if (!studioProfile) {
      throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
    }
    return {
      mode: "STUDIO_MASTER",
      providerId: studioProfile.id,
      studioProviderId: studioProfile.studioProviderId,
      studioProfile: true,
    };
  }

  if (!studioId && !masterId) {
    const ownProvider = await getCurrentMasterProviderContext(userId);
    return {
      mode: ownProvider.studioId ? "STUDIO_MASTER" : "SOLO_MASTER",
      providerId: ownProvider.id,
      studioProviderId: ownProvider.studioId,
    };
  }

  if (!studioId || !masterId) {
    throw new AppError("Проверьте правильность заполнения полей.", 400, "VALIDATION_ERROR");
  }

  await ensureStudioRole({
    studioId,
    userId,
    allowed: [StudioRole.OWNER, StudioRole.ADMIN],
  });

  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { providerId: true },
  });
  if (!studio) {
    throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
  }

  const master = await prisma.provider.findFirst({
    where: {
      id: masterId,
      type: "MASTER",
      studioId: studio.providerId,
    },
    select: { id: true },
  });
  if (!master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  return {
    mode: "STUDIO_ADMIN",
    providerId: master.id,
    studioProviderId: studio.providerId,
  };
}
