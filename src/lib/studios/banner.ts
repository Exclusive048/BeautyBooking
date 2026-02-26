import { MediaEntityType, MediaKind } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

function studioBannerSettingKey(studioProviderId: string): string {
  return `studioBannerAssetId:${studioProviderId}`;
}

async function validateStudioBannerAsset(studioProviderId: string, assetId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      kind: true,
      deletedAt: true,
    },
  });

  if (
    !asset ||
    asset.deletedAt ||
    asset.entityType !== MediaEntityType.STUDIO ||
    asset.entityId !== studioProviderId ||
    asset.kind !== MediaKind.PORTFOLIO
  ) {
    throw new AppError("Banner asset is invalid", 400, "MEDIA_ASSET_NOT_FOUND");
  }
}

export async function getStudioBannerAssetId(studioProviderId: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: studioBannerSettingKey(studioProviderId) },
    select: { value: true },
  });
  return setting?.value ?? null;
}

export async function getStudioBannerUrl(studioProviderId: string): Promise<string | null> {
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

  return `/api/media/file/${asset.id}`;
}

export async function setStudioBannerAssetId(studioProviderId: string, assetId: string | null): Promise<void> {
  const key = studioBannerSettingKey(studioProviderId);
  if (!assetId) {
    await prisma.appSetting.deleteMany({ where: { key } });
    await prisma.provider.updateMany({
      where: { id: studioProviderId },
      data: { bannerFocalX: null, bannerFocalY: null },
    });
    return;
  }

  await validateStudioBannerAsset(studioProviderId, assetId);

  await prisma.appSetting.upsert({
    where: { key },
    update: { value: assetId },
    create: { key, value: assetId },
  });
  await prisma.provider.updateMany({
    where: { id: studioProviderId },
    data: { bannerFocalX: null, bannerFocalY: null },
  });
}
