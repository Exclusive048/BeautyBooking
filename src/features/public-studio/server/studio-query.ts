import { cache } from "react";
import { MediaEntityType, MediaKind } from "@prisma/client";
import { emptyOnRefusal } from "@/features/public-profile/master/server/refusal";
import { getViewer } from "@/features/public-profile/master/server/viewer";
import { formatWorkCaption } from "@/lib/feed/work-caption";
import { listMediaAssets } from "@/lib/media/service";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { listPublicTeamMasters } from "@/lib/providers/team-masters";
import { getProviderProfile } from "@/lib/providers/usecases";
import { getStudioPortfolioCaptions, type StudioPortfolioCaption } from "@/lib/studios/portfolio-items";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioMaster } from "@/features/booking/lib/studio-booking";
import type { StudioPhoto } from "@/features/public-studio/components/studio-photos-grid";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";

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

/**
 * Подписи «мастер · услуга» — дополнение к фото: не прочитались — фото
 * показываются без них, а не «Не удалось загрузить блок».
 */
async function loadCaptions(studioId: string): Promise<Map<string, StudioPortfolioCaption>> {
  try {
    return await getStudioPortfolioCaptions(studioId);
  } catch (error) {
    logPublicStudioBlockError("photos-captions", error, ["getStudioPortfolioCaptions"]);
    return new Map();
  }
}

export type StudioPagePhoto = StudioPhoto & {
  /** Это баннер студии: шапка показывает его крупно, в карусели под ней его нет. */
  isBanner: boolean;
};

/**
 * Фото страницы студии для карусели в шапке и раздела «Фотографии студии» —
 * одно правило на оба места (STUDIO-HERO-INFO, 2026-10-14). Наружу — ссылка,
 * подпись и alt; id файла клиенту не нужен (он и так в ссылке).
 *
 * PORTFOLIO-CROP-01: работа — вырез 4:5, выбранный админом. У баннера вырез
 * 16:9 (кадр шапки), в плитке 4:5 он смотрелся бы полосой — плитка баннера
 * берёт исходник.
 */
export const getStudioPagePhotos = cache(async (studioId: string): Promise<StudioPagePhoto[]> => {
  if (!studioId) return [];
  const [assets, captions, studio] = await Promise.all([
    getStudioPortfolio(studioId),
    loadCaptions(studioId),
    getStudioProfile(studioId),
  ]);
  const bannerUrl = studio?.bannerUrl ?? null;
  return assets.map((asset, index) => {
    const caption = captions.get(asset.id);
    const isBanner = bannerUrl !== null && asset.url === bannerUrl;
    return {
      url: isBanner ? asset.url : asset.displayUrl,
      alt: UI_TEXT.publicStudio.photoAltTemplate.replace("{n}", String(index + 1)),
      caption: caption ? formatWorkCaption(caption.performerName, caption.subject) : null,
      isBanner,
    };
  });
});
