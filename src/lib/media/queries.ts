import { MediaEntityType, MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvatarUrlForEntity } from "@/lib/media/service";

export async function getLatestAvatarUrlForEntity(
  entityType: MediaEntityType,
  entityId: string,
  externalUrl?: string | null
): Promise<string | null> {
  return getAvatarUrlForEntity({ entityType, entityId, externalUrl });
}

export async function getSiteLogoUrl(): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: "siteLogoAssetId" },
    select: { value: true },
  });
  if (!setting?.value) return null;
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: setting.value },
    select: { id: true, deletedAt: true, kind: true, entityType: true, entityId: true },
  });
  if (!asset || asset.deletedAt || asset.entityType !== MediaEntityType.SITE || asset.entityId !== "site" || asset.kind !== MediaKind.AVATAR) {
    return null;
  }
  return `/api/media/file/${asset.id}`;
}
