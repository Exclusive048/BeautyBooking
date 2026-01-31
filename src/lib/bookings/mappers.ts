import type { Prisma } from "@prisma/client";
import type { BookingClientDto, BookingDto, BookingStatusUpdateDto } from "@/lib/bookings/dto";
import { toISO } from "@/lib/time";

type BookingWithServiceModel = Prisma.BookingGetPayload<{
  select: {
    id: true;
    slotLabel: true;
    status: true;
    providerId: true;
    masterProviderId: true;
    clientName: true;
    clientPhone: true;
    comment: true;
    startAtUtc: true;
    endAtUtc: true;
    service: { select: { id: true; name: true } };
  };
}>;

type BookingWithServiceProviderModel = Prisma.BookingGetPayload<{
  select: {
    id: true;
    slotLabel: true;
    status: true;
    providerId: true;
    masterProviderId: true;
    clientName: true;
    clientPhone: true;
    comment: true;
    startAtUtc: true;
    endAtUtc: true;
    service: { select: { id: true; name: true } };
    provider: { select: { id: true; name: true; district: true; address: true; type: true } };
  };
}>;

type BookingStatusModel = { id: string; status: BookingStatusUpdateDto["status"] };

export function toBookingDto(model: BookingWithServiceModel): BookingDto {
  return {
    id: model.id,
    slotLabel: model.slotLabel,
    status: model.status,
    providerId: model.providerId,
    masterProviderId: model.masterProviderId ?? null,
    service: {
      id: model.service.id,
      name: model.service.name,
    },
    clientName: model.clientName,
    clientPhone: model.clientPhone,
    comment: model.comment ?? null,
    startAtUtc: model.startAtUtc ? toISO(model.startAtUtc) : null,
    endAtUtc: model.endAtUtc ? toISO(model.endAtUtc) : null,
  };
}

export function toClientBookingDto(model: BookingWithServiceProviderModel): BookingClientDto {
  return {
    ...toBookingDto(model),
    provider: {
      id: model.provider.id,
      name: model.provider.name,
      district: model.provider.district,
      address: model.provider.address,
      type: model.provider.type,
    },
  };
}

export function toBookingStatusUpdateDto(model: BookingStatusModel): BookingStatusUpdateDto {
  return { id: model.id, status: model.status };
}
