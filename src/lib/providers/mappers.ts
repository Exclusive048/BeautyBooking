import type { Provider, Service } from "@prisma/client";
import type { ProviderCardDto, ProviderProfileDto, ProviderServiceDto } from "@/lib/providers/dto";

type ProviderWithServices = Provider & { services: ProviderServiceSource[] };
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
type ProviderServiceSource = Pick<Service, "id" | "name" | "durationMin" | "price">;

export function mapProviderService(service: ProviderServiceSource): ProviderServiceDto {
  return {
    id: service.id,
    name: service.name,
    durationMin: service.durationMin,
    price: service.price,
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

export function mapProviderProfile(provider: ProviderWithServices): ProviderProfileDto {
  return {
    id: provider.id,
    type: provider.type,
    studioId: provider.studioId,
    name: provider.name,
    avatarUrl: provider.avatarUrl,
    bannerUrl: null,
    tagline: provider.tagline,
    description: provider.description ?? null,
    rating: provider.rating,
    reviews: provider.reviews,
    priceFrom: provider.priceFrom,
    address: provider.address,
    district: provider.district,
    categories: provider.categories,
    availableToday: provider.availableToday,
    geoLat: provider.geoLat,
    geoLng: provider.geoLng,
    superpowerBadges: [],
    services: provider.services.map(mapProviderService),
  };
}
