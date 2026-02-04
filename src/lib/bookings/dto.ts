import type { ProviderType } from "@prisma/client";

export type BookingStatusDto =
  | "NEW"
  | "PENDING"
  | "CONFIRMED"
  | "PREPAID"
  | "STARTED"
  | "FINISHED"
  | "CANCELLED"
  | "NO_SHOW";

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
  startAtUtc: string | null;
  endAtUtc: string | null;
};

export type BookingClientDto = BookingDto & {
  provider: BookingProviderDto;
};

export type BookingStatusUpdateDto = {
  id: string;
  status: BookingStatusDto;
};
