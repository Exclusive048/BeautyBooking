import type { PrismaClient } from "@prisma/client";
import { type CropArea, toCropArea } from "@/lib/media/crop-geometry";
import { buildMediaDisplayUrl, parseMediaFileAssetId } from "@/lib/media/types";
import { prisma } from "@/lib/prisma";

/**
 * PORTFOLIO-CROP-01 — ссылки, по которым работы портфолио показываются.
 *
 * Мастер обрезает фото работы в кабинете, область сохраняется на `MediaAsset`
 * (`cropX/…`), но `PortfolioItem.mediaUrl` — ссылка на ИСХОДНИК, и ни одна
 * поверхность область не читала: обрезка «не применялась» нигде. Переписать
 * `mediaUrl` на ссылку выреза нельзя: по нему работа связана с файлом (связи
 * в схеме нет) — точным сравнением в синхронизации фото студии, в SQL
 * визуального поиска и в скрипте чистки сирот, который такую работу счёл бы
 * осиротевшей и удалил её фото. Поэтому ссылка для показа выводится на чтении:
 * один запрос на всю выдачу, вырез — тот же роут, что у аватаров
 * (`/api/media/file/[id]/crop/[v]`).
 *
 * Ссылка без ассета (заглушки сидов, старые абсолютные ссылки хранилища) и
 * фото без области возвращаются как есть.
 */
export type PortfolioDisplayUrl = (mediaUrl: string) => string;

export type PortfolioMediaView = {
  displayUrl: PortfolioDisplayUrl;
  /** Сохранённая область — редактору обрезки, чтобы открыть его на выбранном кадре. */
  cropOf: (mediaUrl: string) => CropArea | null;
};

type MediaAssetReader = Pick<PrismaClient, "mediaAsset">;

export async function loadPortfolioMediaView(
  mediaUrls: Iterable<string>,
  client: MediaAssetReader = prisma,
): Promise<PortfolioMediaView> {
  const assetIdByUrl = new Map<string, string>();
  for (const mediaUrl of mediaUrls) {
    if (assetIdByUrl.has(mediaUrl)) continue;
    const assetId = parseMediaFileAssetId(mediaUrl);
    if (assetId) assetIdByUrl.set(mediaUrl, assetId);
  }
  if (assetIdByUrl.size === 0) {
    return { displayUrl: (mediaUrl) => mediaUrl, cropOf: () => null };
  }

  const assets = await client.mediaAsset.findMany({
    where: { id: { in: [...new Set(assetIdByUrl.values())] } },
    select: { id: true, cropX: true, cropY: true, cropWidth: true, cropHeight: true },
  });
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const assetOf = (mediaUrl: string) => {
    const assetId = assetIdByUrl.get(mediaUrl);
    return assetId ? assetById.get(assetId) : undefined;
  };

  return {
    displayUrl: (mediaUrl) => {
      const asset = assetOf(mediaUrl);
      return asset ? buildMediaDisplayUrl(asset) : mediaUrl;
    },
    cropOf: (mediaUrl) => {
      const asset = assetOf(mediaUrl);
      return asset ? toCropArea(asset.cropX, asset.cropY, asset.cropWidth, asset.cropHeight) : null;
    },
  };
}

export async function loadPortfolioDisplayUrls(
  mediaUrls: Iterable<string>,
  client: MediaAssetReader = prisma,
): Promise<PortfolioDisplayUrl> {
  return (await loadPortfolioMediaView(mediaUrls, client)).displayUrl;
}
