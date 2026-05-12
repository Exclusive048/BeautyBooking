/** Widget phase — high-level state of the 4-phase flow (32b). */
export type BookingFlowPhase = "selection" | "form" | "success" | "conflict";

export type BookingFlowSlot = {
  id: string;
  label: string;
  timeText: string;
  startAtUtc: string;
  endAtUtc: string;
  dayKey: string;
  disabled?: boolean;
  isHot?: boolean;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
  hotSlotId?: string | null;
  originalPrice?: number | null;
  discountedPrice?: number | null;
  discountPercent?: number | null;
};

/**
 * Confirmation payload — what we render in the success phase. Source
 * is either (a) the POST response on first submit, or (b) the
 * `/api/public/bookings/[id]` refresh GET when the URL contains
 * `?bookingId=`.
 */
export type ConfirmedBooking = {
  id: string;
  status: string;
  startAtUtc: string;
  endAtUtc: string | null;
  serviceName: string;
  servicePrice: number;
  providerName: string;
  providerAddress: string | null;
  timezone: string;
  /** Already-masked for display, e.g. "+7 ••• ••• 56 78". */
  clientPhoneMasked: string | null;
  /** True for users who came in via session; controls cancel CTA. */
  isAuthenticatedUser: boolean;
};

export type BookingFlowState = {
  phase: BookingFlowPhase;

  // Static service context (passed in from parent — provider profile).
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;

  // Selection phase
  selectedDateKey: string | null;
  selectedSlot: BookingFlowSlot | null;

  // Form phase
  clientName: string;
  clientPhone: string;
  comment: string;
  silentMode: boolean;
  referencePhotoAssetId: string | null;
  bookingAnswers: Record<string, string>;

  // Final phase
  confirmedBooking: ConfirmedBooking | null;
};
