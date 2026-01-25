export type ProviderService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
};

export type ProviderProfileFull = {
  id: string;
  name: string;
  tagline: string;
  address: string;
  district: string;
  rating: number;
  reviews: number;
  categories: string[];
  works: Array<{ id: string; title: string }>;
  services: ProviderService[];
};
