import { MediaEntityType, MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvatarUrlForEntity } from "@/lib/media/service";
import { SITE_LOGIN_HERO_SETTING_KEY, SITE_LOGO_SETTING_KEY } from "@/lib/media/settings";

export async function getLatestAvatarUrlForEntity(
  entityType: MediaEntityType,
  entityId: string,
  externalUrl?: string | null
): Promise<string | null> {
  return getAvatarUrlForEntity({ entityType, entityId, externalUrl });
}

async function getSiteAssetUrlBySettingKey(settingKey: string, kind: MediaKind): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: settingKey },
    select: { value: true },
  });
  if (!setting?.value) return null;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: setting.value },
    select: { id: true, deletedAt: true, kind: true, entityType: true, entityId: true },
  });

  if (!asset || asset.deletedAt || asset.entityType !== MediaEntityType.SITE || asset.entityId !== "site" || asset.kind !== kind) {
    return null;
  }

  return `/api/media/file/${asset.id}`;
}

export async function getSiteLogoUrl(): Promise<string | null> {
  return getSiteAssetUrlBySettingKey(SITE_LOGO_SETTING_KEY, MediaKind.AVATAR);
}

export async function getLoginHeroImageUrl(): Promise<string | null> {
  return getSiteAssetUrlBySettingKey(SITE_LOGIN_HERO_SETTING_KEY, MediaKind.PORTFOLIO);
}
