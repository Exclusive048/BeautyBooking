export type ProviderTypeDto = "MASTER" | "STUDIO";

export type ProviderServiceDto = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
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
  services: ProviderServiceDto[];
};
