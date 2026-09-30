import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvatarUrlForEntity } from "@/lib/media/service";
import { buildAvatarDisplayUrl, buildMediaFileUrl } from "@/lib/media/types";
import {
  SITE_LOGIN_HERO_SETTING_KEY,
  SITE_LOGO_SETTING_KEY,
} from "@/lib/media/settings";
import { readSiteAssetCache, writeSiteAssetCache } from "@/lib/media/site-asset-cache";

export async function getLatestAvatarUrlForEntity(
  entityType: MediaEntityType,
  entityId: string,
  externalUrl?: string | null
): Promise<string | null> {
  return getAvatarUrlForEntity({ entityType, entityId, externalUrl });
}

type SiteAsset = { url: string } | null;

/**
 * Картинка сайта по ключу настройки — через кэш (29.09 доработки · 20): шапка
 * каждой страницы спрашивает логотип, а меняется он раз в месяцы. Сброс —
 * `invalidateSiteAssetCache` в `lib/media/service.ts`.
 */
async function getSiteAssetBySettingKey(
  settingKey: string,
  kind: MediaKind,
): Promise<SiteAsset> {
  const cached = await readSiteAssetCache(settingKey);
  if (cached) return cached.asset;
  const asset = await loadSiteAssetBySettingKey(settingKey, kind);
  await writeSiteAssetCache(settingKey, asset);
  return asset;
}

async function loadSiteAssetBySettingKey(
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
      cropX: true,
      cropY: true,
      cropWidth: true,
      cropHeight: true,
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

  // CROP-PUBLIC-01: логотип (AVATAR) показывают вырезанным по сохранённой
  // области. Картинка экрана входа (PORTFOLIO) — исходником: её кадр задаёт
  // `object-position` на месте показа.
  return {
    url: kind === MediaKind.AVATAR ? buildAvatarDisplayUrl(asset) : buildMediaFileUrl(asset.id),
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
