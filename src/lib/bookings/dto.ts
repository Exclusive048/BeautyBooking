import type { ProviderType } from "@prisma/client";

export type BookingStatusDto =
  | "NEW"
  | "PENDING"
  | "CONFIRMED"
  | "CHANGE_REQUESTED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "PREPAID"
  | "STARTED"
  | "FINISHED"
  | "CANCELLED"
  | "NO_SHOW";

export type BookingActorDto = "CLIENT" | "MASTER";

export type BookingServiceDto = {
  id: string;
  name: string;
};

export type BookingProviderDto = {
  id: string;
  name: string;
  district: string;
  address: string;
  type: ProviderType;
};

export type BookingDto = {
  id: string;
  slotLabel: string;
  status: BookingStatusDto;
  providerId: string;
  masterProviderId: string | null;
  service: BookingServiceDto;
  clientName: string;
  clientPhone: string;
  comment: string | null;
  silentMode: boolean;
  startAtUtc: string | null;
  endAtUtc: string | null;
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  requestedBy: BookingActorDto | null;
  actionRequiredBy: BookingActorDto | null;
  changeComment: string | null;
  clientChangeRequestsCount: number;
  masterChangeRequestsCount: number;
};

export type BookingClientDto = BookingDto & {
  provider: BookingProviderDto;
};

export type BookingStatusUpdateDto = {
  id: string;
  status: BookingStatusDto;
};
