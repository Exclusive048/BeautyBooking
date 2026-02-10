export type AvailabilitySlotPreview = {
  startAtUtc: string;
  label: string;
  isHot?: boolean;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
};

export type AvailabilityProviderItem = {
  providerId: string;
  providerType: "MASTER" | "STUDIO";
  publicUsername: string;
  name: string;
  avatarUrl: string | null;
  ratingAvg: number;
  reviewsCount: number;
  priceFrom: number | null;
  photos: string[];
  address: string | null;
  district: string | null;
  service: {
    id: string;
    title: string;
    price: number;
    durationMin: number;
  };
  slots: AvailabilitySlotPreview[];
};

export type AvailabilitySearchResponse = {
  items: AvailabilityProviderItem[];
};

export type ServiceSuggestion = {
  id: string;
  title: string;
};

export type ServiceSuggestResponse = {
  items: ServiceSuggestion[];
};
