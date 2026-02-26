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
  avatarFocalX: number | null;
  avatarFocalY: number | null;
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
  avatarFocalX: number | null;
  avatarFocalY: number | null;
  bannerUrl: string | null;
  bannerFocalX: number | null;
  bannerFocalY: number | null;
  tagline: string;
  description: string | null;
  publicUsername: string | null;
  isPublished: boolean;
  rating: number;
  reviews: number;
  priceFrom: number;
  address: string;
  district: string;
  categories: string[];
  availableToday: boolean;
  timezone: string;
  cancellationDeadlineHours: number | null;
  hotSlotsEnabled: boolean;
  geoLat: number | null;
  geoLng: number | null;
  superpowerBadges: ProviderSuperpowerBadgeDto[];
  services: ProviderServiceDto[];
};
