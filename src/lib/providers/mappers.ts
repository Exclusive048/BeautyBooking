import type { Provider, Service } from "@prisma/client";
import type { ProviderCardDto, ProviderProfileDto, ProviderServiceDto } from "@/lib/providers/dto";

type ProviderProfileSource = Pick<
  Provider,
  | "id"
  | "type"
  | "studioId"
  | "name"
  | "avatarUrl"
  | "tagline"
  | "description"
  | "publicUsername"
  | "isPublished"
  | "rating"
  | "reviews"
  | "priceFrom"
  | "address"
  | "district"
  | "categories"
  | "availableToday"
  | "timezone"
  | "socialVk"
  | "socialInstagram"
  | "cancellationDeadlineHours"
  | "geoLat"
  | "geoLng"
> & { services: ProviderServiceSource[] };
type ProviderCardSource = Pick<
  Provider,
  | "id"
  | "type"
  | "name"
  | "avatarUrl"
  | "tagline"
  | "rating"
  | "reviews"
  | "priceFrom"
  | "address"
  | "district"
  | "categories"
  | "availableToday"
>;
type ProviderServiceSource = Pick<Service, "id" | "name" | "durationMin" | "price"> & {
  // FIX-R2-04-C: canonical attached category = Service.globalCategory (label +
  // orderIndex). Optional — the public booking surfaces (getProviderProfile)
  // select it for grouping; cabinet/internal callers (e.g. /api/providers/me)
  // omit it and simply get `categoryName: null` (no grouping needed there).
  globalCategory?: { name: string; orderIndex: number } | null;
};

export function mapProviderService(service: ProviderServiceSource): ProviderServiceDto {
  return {
    id: service.id,
    name: service.name,
    durationMin: service.durationMin,
    price: service.price,
    categoryName: service.globalCategory?.name ?? null,
    categoryOrder: service.globalCategory?.orderIndex ?? null,
  };
}

export function mapProviderCard(provider: ProviderCardSource): ProviderCardDto {
  return {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    avatarUrl: provider.avatarUrl,
    tagline: provider.tagline,
    rating: provider.rating,
    reviews: provider.reviews,
    priceFrom: provider.priceFrom,
    address: provider.address,
    district: provider.district,
    categories: provider.categories,
    availableToday: provider.availableToday,
  };
}

export function mapProviderProfile(provider: ProviderProfileSource): ProviderProfileDto {
  return {
    id: provider.id,
    type: provider.type,
    studioId: provider.studioId,
    name: provider.name,
    avatarUrl: provider.avatarUrl,
    bannerUrl: null,
    tagline: provider.tagline,
    description: provider.description ?? null,
    publicUsername: provider.publicUsername ?? null,
    isPublished: provider.isPublished,
    rating: provider.rating,
    reviews: provider.reviews,
    priceFrom: provider.priceFrom,
    address: provider.address,
    district: provider.district,
    categories: provider.categories,
    availableToday: provider.availableToday,
    timezone: provider.timezone,
    socialVk: provider.socialVk ?? null,
    socialInstagram: provider.socialInstagram ?? null,
    cancellationDeadlineHours: provider.cancellationDeadlineHours ?? null,
    hotSlotsEnabled: false,
    geoLat: provider.geoLat,
    geoLng: provider.geoLng,
    superpowerBadges: [],
    services: provider.services.map(mapProviderService),
    sellsOwnServices: provider.type === "MASTER" && !provider.studioId,
  };
}
