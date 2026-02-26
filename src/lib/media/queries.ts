import { MediaEntityType, MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvatarUrlForEntity } from "@/lib/media/service";
import {
  SITE_LOGIN_HERO_FOCAL_SETTING_KEY,
  SITE_LOGIN_HERO_SETTING_KEY,
  SITE_LOGO_FOCAL_SETTING_KEY,
  SITE_LOGO_SETTING_KEY,
} from "@/lib/media/settings";

export async function getLatestAvatarUrlForEntity(
  entityType: MediaEntityType,
  entityId: string,
  externalUrl?: string | null
): Promise<string | null> {
  return getAvatarUrlForEntity({ entityType, entityId, externalUrl });
}

type SiteAsset = { url: string; focalX: number | null; focalY: number | null } | null;

function parseFocalValue(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  if (!("x" in value) || !("y" in value)) return null;
  const typed = value as { x?: unknown; y?: unknown };
  if (typeof typed.x !== "number" || typeof typed.y !== "number") return null;
  return { x: typed.x, y: typed.y };
}

async function getSiteAssetBySettingKey(
  settingKey: string,
  kind: MediaKind,
  focalKey: string
): Promise<SiteAsset> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: settingKey },
    select: { value: true },
  });
  if (!setting?.value) return null;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: setting.value },
    select: { id: true, deletedAt: true, kind: true, entityType: true, entityId: true, focalX: true, focalY: true },
  });

  if (!asset || asset.deletedAt || asset.entityType !== MediaEntityType.SITE || asset.entityId !== "site" || asset.kind !== kind) {
    return null;
  }

  const focalRecord = await prisma.systemConfig.findUnique({
    where: { key: focalKey },
    select: { value: true },
  });
  const focal = parseFocalValue(focalRecord?.value);

  return {
    url: `/api/media/file/${asset.id}`,
    focalX: focal?.x ?? asset.focalX ?? null,
    focalY: focal?.y ?? asset.focalY ?? null,
  };
}

export async function getSiteLogoUrl(): Promise<string | null> {
  const asset = await getSiteAssetBySettingKey(
    SITE_LOGO_SETTING_KEY,
    MediaKind.AVATAR,
    SITE_LOGO_FOCAL_SETTING_KEY
  );
  return asset?.url ?? null;
}

export async function getLoginHeroImageUrl(): Promise<string | null> {
  const asset = await getSiteAssetBySettingKey(
    SITE_LOGIN_HERO_SETTING_KEY,
    MediaKind.PORTFOLIO,
    SITE_LOGIN_HERO_FOCAL_SETTING_KEY
  );
  return asset?.url ?? null;
}

export async function getSiteLogoAsset(): Promise<SiteAsset> {
  return getSiteAssetBySettingKey(
    SITE_LOGO_SETTING_KEY,
    MediaKind.AVATAR,
    SITE_LOGO_FOCAL_SETTING_KEY
  );
}

export async function getLoginHeroImageAsset(): Promise<SiteAsset> {
  return getSiteAssetBySettingKey(
    SITE_LOGIN_HERO_SETTING_KEY,
    MediaKind.PORTFOLIO,
    SITE_LOGIN_HERO_FOCAL_SETTING_KEY
  );
}
