import type { CropArea } from "@/lib/media/crop-geometry";

export type ProviderTypeDto = "MASTER" | "STUDIO";

// ─────────────────────────────────────────────────────────────────────────
// Rule 12 — DOCUMENTED BOOKING-FLOW EXCEPTION (RULE-12-PROVIDERS, FIX-16).
//
// `ProviderProfileDto.id` / `.studioId` and `ProviderServiceDto.id` are the
// internal CUIDs the public profile → booking flow genuinely needs for the
// client's subsequent requests — the slots endpoint
// (`/api/public/providers/<id>/slots`), `createBooking({ providerId })`, the
// favorite toggle, and the master-in-studio "book at studio" link are all
// keyed by these ids. Rule 12 explicitly exempts "booking-флоу где id нужен
// клиенту для последующих запросов".
//
// Removing them would require a booking-endpoint CONTRACT change (slots +
// createBooking + favorite accepting an opaque token / publicUsername) on the
// conversion-critical path — flagged for decision, NOT done unilaterally
// (RULE-12-PROVIDERS-OPTIONAL in BACKLOG). All NON-booking provider/feed
// surfaces are clean (FIX-13/14/15) or carry their own documented exception.
// ─────────────────────────────────────────────────────────────────────────
export type ProviderServiceDto = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  // FIX-R2-04-C: attached global-category LABEL (+ order) for presentational
  // grouping of the public booking service list. Rule-12-safe — `categoryName`
  // is a human label and `categoryOrder` a sort int, neither an internal id.
  // `null` when the service has no attached category (→ "Другие услуги" bucket).
  categoryName: string | null;
  categoryOrder: number | null;
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
  /**
   * STUDIO-MASTER-PROFILES (этап 4): у личной страницы мастера — `Provider.id`
   * его профиля в студии (им запись в студию выбирает мастера); `null`, если
   * мастер в студии не работает или его профиль там неактивен.
   */
  studioMasterProfileId: string | null;
  name: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** Область кадра баннера (доли исходника); `null` — кадр не выбирали. */
  bannerCrop: CropArea | null;
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
  // FEAT-PROVIDER-SOCIALS: normalized safe community-link URLs (or null).
  // Rule-12-safe — a social link is public by design (no internal id).
  socialVk: string | null;
  socialInstagram: string | null;
  cancellationDeadlineHours: number | null;
  hotSlotsEnabled: boolean;
  geoLat: number | null;
  geoLng: number | null;
  superpowerBadges: ProviderSuperpowerBadgeDto[];
  services: ProviderServiceDto[];
  /**
   * STUDIO-MASTER-OWN-BOOKINGS-01 — услуги в `services` собственные и
   * бронируются на этой странице (соло-мастер; мастер студии со своими
   * услугами). `false` — это услуги студии, и запись идёт через студию.
   */
  sellsOwnServices: boolean;
};
