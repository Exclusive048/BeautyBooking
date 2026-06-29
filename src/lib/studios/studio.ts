import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { detectCityFromAddress } from "@/lib/cities/detect-city";
import { getStudioBannerAssetId, getStudioBannerUrl, setStudioBannerAssetId } from "@/lib/studios/banner";

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
  description: string | null;
  avatarUrl: string | null;
  geoLat: number | null;
  geoLng: number | null;
  isPublished: boolean;
  timezone: string;
  bufferBetweenBookingsMin: number;
  bannerAssetId: string | null;
  bannerUrl: string | null;
  cancellationDeadlineHours: number | null;
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
      description: true,
      avatarUrl: true,
      geoLat: true,
      geoLng: true,
      isPublished: true,
      timezone: true,
      bufferBetweenBookingsMin: true,
      cancellationDeadlineHours: true,
      remindersEnabled: true,
    },
  });

  if (!provider || provider.type !== ProviderType.STUDIO) return null;

  const [bannerAssetId, bannerUrl] = await Promise.all([
    getStudioBannerAssetId(provider.id),
    getStudioBannerUrl(provider.id),
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
    description: provider.description,
    avatarUrl: provider.avatarUrl,
    geoLat: provider.geoLat,
    geoLng: provider.geoLng,
    isPublished: provider.isPublished,
    timezone: provider.timezone,
    bufferBetweenBookingsMin: provider.bufferBetweenBookingsMin,
    bannerAssetId,
    bannerUrl,
    cancellationDeadlineHours: provider.cancellationDeadlineHours ?? null,
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
  description?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  isPublished?: boolean;
  timezone?: string;
  bannerAssetId?: string | null;
  cancellationDeadlineHours?: number | null;
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

  // Publication gate (R2-02-B): mirror master's `profile.service.ts` exactly —
  // publishing requires a non-empty address AND a resolved cityId. (Master does
  // NOT require services, so neither do we — the prompt is explicit: mirror, do
  // not invent a stricter studio rule.) Forward-only: the gate fires only on the
  // publish ACTION (isPublished:true in this request). Setting isPublished:false,
  // or any request that omits isPublished, is never blocked — an already-published
  // studio is never retroactively unpublished. The canonical address/cityId fall
  // back to the stored row when this request just toggles publish without an
  // address change.
  if (input.isPublished === true) {
    const existing = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { address: true, cityId: true },
    });
    const canonicalAddress =
      typeof input.address === "string" && input.address.trim()
        ? input.address.trim()
        : (existing?.address?.trim() ?? "");
    const canonicalCityId = derivedCityId ?? existing?.cityId ?? null;
    if (!canonicalAddress || !canonicalCityId) {
      throw new AppError(
        "Заполните адрес, чтобы опубликовать студию",
        400,
        "ADDRESS_REQUIRED",
      );
    }
  }

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
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.geoLat !== undefined ? { geoLat: input.geoLat } : {}),
      ...(input.geoLng !== undefined ? { geoLng: input.geoLng } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(derivedCityId !== undefined ? { cityId: derivedCityId } : {}),
      ...(resolvedTimezone !== undefined ? { timezone: resolvedTimezone } : {}),
      ...(input.cancellationDeadlineHours !== undefined
        ? { cancellationDeadlineHours: input.cancellationDeadlineHours }
        : {}),
      ...(input.remindersEnabled !== undefined ? { remindersEnabled: input.remindersEnabled } : {}),
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
      description: true,
      avatarUrl: true,
      geoLat: true,
      geoLng: true,
      isPublished: true,
      timezone: true,
      bufferBetweenBookingsMin: true,
      cancellationDeadlineHours: true,
      remindersEnabled: true,
    },
  });

  if (!provider || provider.type !== ProviderType.STUDIO) return null;

  if (input.bannerAssetId !== undefined) {
    await setStudioBannerAssetId(provider.id, input.bannerAssetId);
  }

  const [bannerAssetId, bannerUrl] = await Promise.all([
    getStudioBannerAssetId(provider.id),
    getStudioBannerUrl(provider.id),
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
    description: provider.description,
    avatarUrl: provider.avatarUrl,
    geoLat: provider.geoLat,
    geoLng: provider.geoLng,
    isPublished: provider.isPublished,
    timezone: provider.timezone,
    bufferBetweenBookingsMin: provider.bufferBetweenBookingsMin,
    bannerAssetId,
    bannerUrl,
    cancellationDeadlineHours: provider.cancellationDeadlineHours ?? null,
    remindersEnabled: provider.remindersEnabled,
  };
}
