import { cache } from "react";
import { MediaEntityType, MediaKind } from "@prisma/client";
import { emptyOnRefusal } from "@/features/public-profile/master/server/refusal";
import { getViewer } from "@/features/public-profile/master/server/viewer";
import { listMediaAssets } from "@/lib/media/service";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { listPublicTeamMasters } from "@/lib/providers/team-masters";
import { getProviderProfile } from "@/lib/providers/usecases";
import type { StudioMaster } from "@/features/booking/lib/studio-booking";

// 29.09 доработки · 13: секции страницы студии читают сервисы напрямую, а не
// HTTP-запросом к собственному API. Отказ 4xx (не найдена, не опубликована) —
// «пусто», прочие исключения — наверх, в «Не удалось загрузить блок».

export const getStudioProfile = cache(async (studioId: string): Promise<ProviderProfileDto | null> => {
  if (!studioId) return null;
  return emptyOnRefusal<ProviderProfileDto | null>(() => getProviderProfile(studioId), null);
});

/**
 * Фото студии — для шапки (галерея) и секции «Фотографии». Под `cache`: раньше
 * каждая секция запрашивала их сама, и страница делала два одинаковых запроса
 * (29.09 доработки · 00-12).
 */
export const getStudioPortfolio = cache(async (studioId: string): Promise<MediaAssetDto[]> => {
  if (!studioId) return [];
  const viewer = await getViewer();
  return emptyOnRefusal<MediaAssetDto[]>(
    () => listMediaAssets(viewer, { entityType: MediaEntityType.STUDIO, entityId: studioId, kind: MediaKind.PORTFOLIO }),
    [],
  );
});

export const getStudioMasters = cache(async (studioId: string): Promise<StudioMaster[]> => {
  if (!studioId) return [];
  return emptyOnRefusal<StudioMaster[]>(() => listPublicTeamMasters(studioId), []);
});
