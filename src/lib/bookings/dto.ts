import type { BookingStatus, ProviderType } from "@prisma/client";
import type { BookingRuntimeStatus } from "@/lib/bookings/flow";

type BookingParty = "CLIENT" | "MASTER";

export type BookingDto = {
  id: string;
  slotLabel: string;
  status: BookingRuntimeStatus;
  providerId: string;
  masterProviderId: string | null;
  service: {
    id: string;
    name: string;
  };
  clientName: string;
  clientPhone: string;
  comment: string | null;
  silentMode: boolean;
  startAtUtc: string | null;
  endAtUtc: string | null;
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  requestedBy: BookingParty | null;
  actionRequiredBy: BookingParty | null;
  changeComment: string | null;
  clientChangeRequestsCount: number;
  masterChangeRequestsCount: number;
};

export type BookingClientProviderDto = {
  id: string;
  name: string;
  district: string | null;
  address: string | null;
  type: ProviderType;
  publicUsername: string | null;
  avatarUrl: string | null;
  cancellationDeadlineHours: number | null;
};

export type BookingClientDto = Omit<BookingDto, "service"> & {
  service: {
    id: string;
    name: string;
    price: number;
    durationMin: number;
  };
  provider: BookingClientProviderDto;
  masterProvider: BookingClientProviderDto | null;
};

export type BookingStatusUpdateDto = {
  id: string;
  status: BookingStatus;
};

export type ClientBookingStatus = BookingStatus;

export type ClientBooking = {
  id: string;
  status: ClientBookingStatus;
  provider: { id: string };
};
