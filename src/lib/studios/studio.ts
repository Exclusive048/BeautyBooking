import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { detectCityFromAddress } from "@/lib/cities/detect-city";
import { resolveStoredSocialLink, socialHostLabel, type SocialKind } from "@/lib/providers/social-links";
import { getStudioBannerAssetId, getStudioBannerUrl, setStudioBannerAssetId } from "@/lib/studios/banner";
import { getStudioCatalogCoverAssetId, setStudioCatalogCoverAssetId } from "@/lib/studios/catalog-cover";
import {
  applyProviderBookingPolicy,
  type LateCancelAction,
} from "@/lib/schedule/editor";

// FEAT-PROVIDER-SOCIALS: normalize a raw social input into the value to store
// (safe URL or null), throwing a clean 400 on hostile/foreign input. The
// server is the authoritative validation boundary (client preview mirrors it).
function resolveSocialOrThrow(kind: SocialKind, raw: string | null | undefined): string | null {
  const result = resolveStoredSocialLink(kind, raw);
  if ("invalid" in result) {
    const label = kind === "vk" ? "VK" : "Instagram";
    throw new AppError(
      `Не удалось сохранить ссылку на ${label}. Укажите адрес страницы на ${socialHostLabel(kind)}.`,
      400,
      "INVALID_SOCIAL_LINK",
    );
  }
  return result.value;
}

export type StudioProviderPrivateDto = {
  id: string;
  name: string;
  tagline: string;
  address: string;
  district: string;
  categories: string[];
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  socialVk: string | null;
  socialInstagram: string | null;
  description: string | null;
  avatarUrl: string | null;
  geoLat: number | null;
  geoLng: number | null;
  isPublished: boolean;
  timezone: string;
  bufferBetweenBookingsMin: number;
  bannerAssetId: string | null;
  bannerUrl: string | null;
  /** CATALOG-MAIN-PHOTO: главное фото карточки каталога (из портфолио студии). */
  catalogCoverAssetId: string | null;
  // FIX-STUDIO-POLICY-EDITABLE: правила записи студии — читаются и правятся
  // прямо в настройках студии, без экрана расписания мастера.
  minBookingHoursAhead: number;
  maxBookingDaysAhead: number;
  cancellationDeadlineHours: number | null;
  lateCancelAction: string;
  acceptNewClients: boolean;
  remindersEnabled: boolean;
};

export async function getStudioProviderById(
  providerId: string
): Promise<StudioProviderPrivateDto | null> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      type: true,
      name: true,
      tagline: true,
      address: true,
      district: true,
      categories: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      socialVk: true,
      socialInstagram: true,
      description: true,
      avatarUrl: true,
      geoLat: true,
      geoLng: true,
      isPublished: true,
      timezone: true,
      bufferBetweenBookingsMin: true,
      minBookingHoursAhead: true,
      maxBookingDaysAhead: true,
      cancellationDeadlineHours: true,
      lateCancelAction: true,
      acceptNewClients: true,
      remindersEnabled: true,
    },
  });

  if (!provider || provider.type !== ProviderType.STUDIO) return null;

  const [bannerAssetId, bannerUrl, catalogCoverAssetId] = await Promise.all([
    getStudioBannerAssetId(provider.id),
    getStudioBannerUrl(provider.id),
    getStudioCatalogCoverAssetId(provider.id),
  ]);

  return {
    id: provider.id,
    name: provider.name,
    tagline: provider.tagline,
    address: provider.address,
    district: provider.district,
    categories: provider.categories,
    contactName: provider.contactName,
    contactPhone: provider.contactPhone,
    contactEmail: provider.contactEmail,
    socialVk: provider.socialVk,
    socialInstagram: provider.socialInstagram,
    description: provider.description,
    avatarUrl: provider.avatarUrl,
    geoLat: provider.geoLat,
    geoLng: provider.geoLng,
    isPublished: provider.isPublished,
    timezone: provider.timezone,
    bufferBetweenBookingsMin: provider.bufferBetweenBookingsMin,
    bannerAssetId,
    bannerUrl,
    catalogCoverAssetId,
    minBookingHoursAhead: provider.minBookingHoursAhead,
    maxBookingDaysAhead: provider.maxBookingDaysAhead,
    cancellationDeadlineHours: provider.cancellationDeadlineHours ?? null,
    lateCancelAction: provider.lateCancelAction,
    acceptNewClients: provider.acceptNewClients,
    remindersEnabled: provider.remindersEnabled,
  };
}

export type StudioProfileUpdate = {
  name?: string;
  tagline?: string;
  address?: string;
  district?: string;
  categories?: string[];
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  socialVk?: string | null;
  socialInstagram?: string | null;
  description?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  isPublished?: boolean;
  timezone?: string;
  bannerAssetId?: string | null;
  catalogCoverAssetId?: string | null;
  minBookingHoursAhead?: number;
  maxBookingDaysAhead?: number;
  cancellationDeadlineHours?: number | null;
  lateCancelAction?: LateCancelAction;
  acceptNewClients?: boolean;
  remindersEnabled?: boolean;
};

export async function updateStudioProviderProfile(
  providerId: string,
  input: StudioProfileUpdate
): Promise<StudioProviderPrivateDto | null> {
  // FIX-R2-02-A — when the studio's address is (re)set, resolve it to a City and
  // derive both `cityId` and `timezone` from that city (mirrors the master flow,
  // which previously was the only path that linked a provider to a city). The
  // studio otherwise never got a cityId and kept the stale Asia/Almaty default.
  // Conservative on failure: leave cityId/timezone untouched so a working studio
  // is never disrupted by a transient geocoder outage. An explicit selector
  // value (`input.timezone`) always wins over the derived one.
  let derivedCityId: string | undefined;
  let derivedTimezone: string | undefined;
  if (typeof input.address === "string" && input.address.trim()) {
    const detection = await detectCityFromAddress(input.address);
    if (detection.ok) {
      derivedCityId = detection.cityId;
      derivedTimezone = detection.timezone;
    }
  }
  const resolvedTimezone =
    input.timezone !== undefined ? input.timezone : derivedTimezone;

  // FEAT-PROVIDER-SOCIALS: normalize + validate before the write (throws 400
  // on hostile/foreign input). Computed up-front so an invalid link never
  // reaches the DB update.
  const socialData: { socialVk?: string | null; socialInstagram?: string | null } = {};
  if (input.socialVk !== undefined) {
    socialData.socialVk = resolveSocialOrThrow("vk", input.socialVk);
  }
  if (input.socialInstagram !== undefined) {
    socialData.socialInstagram = resolveSocialOrThrow("instagram", input.socialInstagram);
  }

  // VISIBILITY-DEFAULT-01: прежний гейт публикации (R2-02-B, «нужен адрес с
  // городом») снят, зеркально мастеру. Видимость включена с рождения кабинета,
  // а редактор профиля студии шлёт `isPublished` при КАЖДОМ сохранении — гейт
  // отказывал бы в любом сохранении до ввода адреса. Условие «есть город»
  // теперь в предикате поиска (`catalogVisibleProviderWhere`).

  const provider = await prisma.provider.update({
    where: { id: providerId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.district !== undefined ? { district: input.district } : {}),
      ...(input.categories !== undefined ? { categories: input.categories } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(socialData.socialVk !== undefined ? { socialVk: socialData.socialVk } : {}),
      ...(socialData.socialInstagram !== undefined
        ? { socialInstagram: socialData.socialInstagram }
        : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.geoLat !== undefined ? { geoLat: input.geoLat } : {}),
      ...(input.geoLng !== undefined ? { geoLng: input.geoLng } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(derivedCityId !== undefined ? { cityId: derivedCityId } : {}),
      ...(resolvedTimezone !== undefined ? { timezone: resolvedTimezone } : {}),
    },
    select: {
      id: true,
      type: true,
      name: true,
      tagline: true,
      address: true,
      district: true,
      categories: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      socialVk: true,
      socialInstagram: true,
      description: true,
      avatarUrl: true,
      geoLat: true,
      geoLng: true,
      isPublished: true,
      timezone: true,
      bufferBetweenBookingsMin: true,
      minBookingHoursAhead: true,
      maxBookingDaysAhead: true,
      cancellationDeadlineHours: true,
      lateCancelAction: true,
      acceptNewClients: true,
      remindersEnabled: true,
    },
  });

  if (!provider || provider.type !== ProviderType.STUDIO) return null;

  // STUDIO-MASTER-TZ-01: мастера студии работают в её поясе (см.
  // `attachMasterToStudio`). Сменилась зона студии — меняется и у команды,
  // иначе проверка рабочих часов и слоты мастеров остаются в старой зоне.
  if (resolvedTimezone !== undefined) {
    await prisma.provider.updateMany({
      where: { studioId: provider.id, type: ProviderType.MASTER, timezone: { not: resolvedTimezone } },
      data: { timezone: resolvedTimezone },
    });
  }

  if (input.bannerAssetId !== undefined) {
    await setStudioBannerAssetId(provider.id, input.bannerAssetId);
  }

  if (input.catalogCoverAssetId !== undefined) {
    await setStudioCatalogCoverAssetId(provider.id, input.catalogCoverAssetId);
  }

  // FIX-STUDIO-POLICY-EDITABLE: правила записи пишет `editor.ts` (CLAUDE.md
  // rule 5) — там же живёт инвалидация кэша слотов. Здесь остаётся ПРОФИЛЬ.
  // Пишем целиком, а не по полю: `applyProviderBookingPolicy` — снимок правил,
  // и частичная запись означала бы второе место, где решается, что считать
  // «не задано». Значения, которых нет во входе, берём из только что
  // прочитанной строки.
  const policyTouched =
    input.minBookingHoursAhead !== undefined ||
    input.maxBookingDaysAhead !== undefined ||
    input.cancellationDeadlineHours !== undefined ||
    input.lateCancelAction !== undefined ||
    input.acceptNewClients !== undefined ||
    input.remindersEnabled !== undefined;

  const policy = {
    minHoursAhead: input.minBookingHoursAhead ?? provider.minBookingHoursAhead,
    maxDaysAhead: input.maxBookingDaysAhead ?? provider.maxBookingDaysAhead,
    freeCancelHours:
      input.cancellationDeadlineHours !== undefined
        ? input.cancellationDeadlineHours
        : (provider.cancellationDeadlineHours ?? null),
    lateCancelAction:
      input.lateCancelAction ?? (provider.lateCancelAction as LateCancelAction),
    acceptNewClients: input.acceptNewClients ?? provider.acceptNewClients,
    remindersEnabled: input.remindersEnabled ?? provider.remindersEnabled,
  };

  if (policyTouched) {
    await applyProviderBookingPolicy(provider.id, policy);
  }

  const [bannerAssetId, bannerUrl, catalogCoverAssetId] = await Promise.all([
    getStudioBannerAssetId(provider.id),
    getStudioBannerUrl(provider.id),
    getStudioCatalogCoverAssetId(provider.id),
  ]);

  return {
    id: provider.id,
    name: provider.name,
    tagline: provider.tagline,
    address: provider.address,
    district: provider.district,
    categories: provider.categories,
    contactName: provider.contactName,
    contactPhone: provider.contactPhone,
    contactEmail: provider.contactEmail,
    socialVk: provider.socialVk,
    socialInstagram: provider.socialInstagram,
    description: provider.description,
    avatarUrl: provider.avatarUrl,
    geoLat: provider.geoLat,
    geoLng: provider.geoLng,
    isPublished: provider.isPublished,
    timezone: provider.timezone,
    bufferBetweenBookingsMin: provider.bufferBetweenBookingsMin,
    bannerAssetId,
    bannerUrl,
    catalogCoverAssetId,
    minBookingHoursAhead: policy.minHoursAhead,
    maxBookingDaysAhead: policy.maxDaysAhead,
    cancellationDeadlineHours: policy.freeCancelHours,
    lateCancelAction: policy.lateCancelAction,
    acceptNewClients: policy.acceptNewClients,
    remindersEnabled: policy.remindersEnabled,
  };
}
