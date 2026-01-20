export type ProviderType = "MASTER" | "STUDIO";

export type ProviderCardModel = {
  id: string;
  type: ProviderType;
  name: string;
  tagline: string;
  rating: number;
  reviews: number;
  priceFrom: number;
  address: string;
  district: string;
  categories: string[];
};
