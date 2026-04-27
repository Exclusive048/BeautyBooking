import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
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
