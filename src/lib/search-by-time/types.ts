export type AvailabilitySlotPreview = {
  startAtUtc: string;
  label: string;
  isHot?: boolean;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
};

export type AvailabilityProviderItem = {
  // Rule 12 (RULE-12-SWEEP): public availability search NEVER emits the
  // internal provider CUID — consumers key off `publicUsername` (profile
  // link, map key).
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
  geoLat: number | null;
  geoLng: number | null;
  service: {
    // `service.id` is the documented rule-12 booking-flow exception: the slot
    // deep-link `/u/<username>?serviceId=<id>&slotStartAt=<iso>` preselects the
    // service to book (the same `serviceId`-in-URL pattern the catalog uses).
    // The booking page consumes it for `initialServiceId`.
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
