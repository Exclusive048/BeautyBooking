import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
    },
  });

  if (!provider || provider.type !== ProviderType.STUDIO) return null;

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
  };
}
