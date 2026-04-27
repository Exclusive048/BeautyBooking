import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvatarUrlForEntity } from "@/lib/media/service";
import {
  SITE_LOGIN_HERO_SETTING_KEY,
  SITE_LOGO_SETTING_KEY,
} from "@/lib/media/settings";

export async function getLatestAvatarUrlForEntity(
  entityType: MediaEntityType,
  entityId: string,
  externalUrl?: string | null
): Promise<string | null> {
  return getAvatarUrlForEntity({ entityType, entityId, externalUrl });
}

type SiteAsset = { url: string } | null;

async function getSiteAssetBySettingKey(
  settingKey: string,
  kind: MediaKind,
): Promise<SiteAsset> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: settingKey },
    select: { value: true },
  });
  if (!setting?.value) return null;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: setting.value },
    select: {
      id: true,
      deletedAt: true,
      kind: true,
      entityType: true,
      entityId: true,
      status: true,
    },
  });

  if (
    !asset ||
    asset.deletedAt ||
    asset.status !== MediaAssetStatus.READY ||
    asset.entityType !== MediaEntityType.SITE ||
    asset.entityId !== "site" ||
    asset.kind !== kind
  ) {
    return null;
  }

  return {
    url: `/api/media/file/${asset.id}`,
  };
}

export async function getSiteLogoUrl(): Promise<string | null> {
  const asset = await getSiteAssetBySettingKey(
    SITE_LOGO_SETTING_KEY,
    MediaKind.AVATAR,
  );
  return asset?.url ?? null;
}

export async function getLoginHeroImageUrl(): Promise<string | null> {
  const asset = await getSiteAssetBySettingKey(
    SITE_LOGIN_HERO_SETTING_KEY,
    MediaKind.PORTFOLIO,
  );
  return asset?.url ?? null;
}

export async function getSiteLogoAsset(): Promise<SiteAsset> {
  return getSiteAssetBySettingKey(
    SITE_LOGO_SETTING_KEY,
    MediaKind.AVATAR,
  );
}

export async function getLoginHeroImageAsset(): Promise<SiteAsset> {
  return getSiteAssetBySettingKey(
    SITE_LOGIN_HERO_SETTING_KEY,
    MediaKind.PORTFOLIO,
  );
}
