export type ProviderTypeDto = "MASTER" | "STUDIO";

export type ProviderServiceDto = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
};

export type ProviderSuperpowerBadgeDto = {
  code: string;
  title: string;
  subtitle: string;
  icon: string;
  count: number;
};

export type ProviderCardDto = {
  id: string;
  type: ProviderTypeDto;
  name: string;
  avatarUrl: string | null;
  tagline: string;
  rating: number;
  reviews: number;
  priceFrom: number;
  address: string;
  district: string;
  categories: string[];
  availableToday: boolean;
};

export type ProviderProfileDto = {
  id: string;
  type: ProviderTypeDto;
  studioId: string | null;
  name: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  tagline: string;
  description: string | null;
  rating: number;
  reviews: number;
  priceFrom: number;
  address: string;
  district: string;
  categories: string[];
  availableToday: boolean;
  timezone: string;
  geoLat: number | null;
  geoLng: number | null;
  superpowerBadges: ProviderSuperpowerBadgeDto[];
  services: ProviderServiceDto[];
};
