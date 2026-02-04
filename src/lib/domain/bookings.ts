export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type BookingCancelledBy = "CLIENT" | "PROVIDER" | "SYSTEM";

export type BookingCreateInput = {
  providerId: string;
  serviceId: string;
  masterProviderId?: string | null;
  startAtUtc?: Date | null;
  endAtUtc?: Date | null;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment?: string | null;
  silentMode?: boolean;
  clientUserId?: string | null;
  idempotencyKey?: string | null;
};

export type BookingCancelInput = {
  bookingId: string;
  cancelledBy: BookingCancelledBy;
  reason?: string | null;
};
