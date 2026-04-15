export type BookingFlowStep = "date" | "time" | "contacts" | "confirm" | "success";

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

export type BookingFlowState = {
  step: BookingFlowStep;
  direction: 1 | -1;

  // Pre-selected service (passed in from parent)
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;

  // Date step
  selectedDateKey: string | null;

  // Time step
  selectedSlot: BookingFlowSlot | null;

  // Contacts step
  clientName: string;
  clientPhone: string;
  comment: string;
  silentMode: boolean;
  referencePhotoAssetId: string | null;
  bookingAnswers: Record<string, string>;

  // Result
  bookingId: string | null;
};

export type StepMeta = {
  id: BookingFlowStep;
  label: string;
  index: number;
};
