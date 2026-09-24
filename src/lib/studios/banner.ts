import { MediaEntityType, MediaKind } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { toCropArea, type CropArea } from "@/lib/media/crop-geometry";
import { prisma } from "@/lib/prisma";
import { studioBannerSettingKey } from "@/lib/studios/portfolio-items-sync";

/**
 * Изображение — работа из портфолио ЭТОЙ студии (не удалена). Общая проверка
 * баннера и главного фото каталога (`catalog-cover.ts`): оба выбираются из
 * портфолио студии, и ссылаться на чужой или удалённый файл не должны.
 */
export async function isStudioPortfolioAsset(studioProviderId: string, assetId: string): Promise<boolean> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { entityType: true, entityId: true, kind: true, deletedAt: true },
  });
  return Boolean(
    asset &&
      !asset.deletedAt &&
      asset.entityType === MediaEntityType.STUDIO &&
      asset.entityId === studioProviderId &&
      asset.kind === MediaKind.PORTFOLIO,
  );
}

async function validateStudioBannerAsset(studioProviderId: string, assetId: string): Promise<void> {
  if (!(await isStudioPortfolioAsset(studioProviderId, assetId))) {
    throw new AppError("Некорректное изображение баннера.", 400, "MEDIA_ASSET_NOT_FOUND");
  }
}

export async function getStudioBannerAssetId(studioProviderId: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: studioBannerSettingKey(studioProviderId) },
    select: { value: true },
  });
  return setting?.value ?? null;
}

export type StudioBanner = {
  url: string;
  /**
   * STUDIO-BOOKING-BANNER (2026-09-24): область 16:9, выбранная в кабинете
   * (`CropPicker`). Отдаётся отдельно от ссылки: полноразмерный баннер нельзя
   * резать серверным `/crop/{v}` (он ограничен 640 px), поэтому витрина
   * показывает исходник и наводит кадр на центр области.
   */
  crop: CropArea | null;
};

export async function getStudioBannerUrl(studioProviderId: string): Promise<string | null> {
  return (await getStudioBanner(studioProviderId))?.url ?? null;
}

export async function getStudioBanner(studioProviderId: string): Promise<StudioBanner | null> {
  const assetId = await getStudioBannerAssetId(studioProviderId);
  if (!assetId) return null;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      kind: true,
      deletedAt: true,
      cropX: true,
      cropY: true,
      cropWidth: true,
      cropHeight: true,
    },
  });
  if (
    !asset ||
    asset.deletedAt ||
    asset.entityType !== MediaEntityType.STUDIO ||
    asset.entityId !== studioProviderId ||
    asset.kind !== MediaKind.PORTFOLIO
  ) {
    return null;
  }

  return {
    url: `/api/media/file/${asset.id}`,
    crop: toCropArea(asset.cropX, asset.cropY, asset.cropWidth, asset.cropHeight),
  };
}

export async function setStudioBannerAssetId(studioProviderId: string, assetId: string | null): Promise<void> {
  const key = studioBannerSettingKey(studioProviderId);
  if (!assetId) {
    await prisma.appSetting.deleteMany({ where: { key } });
    return;
  }

  await validateStudioBannerAsset(studioProviderId, assetId);

  await prisma.appSetting.upsert({
    where: { key },
    update: { value: assetId },
    create: { key, value: assetId },
  });
}
