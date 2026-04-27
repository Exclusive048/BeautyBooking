import type { Prisma } from "@prisma/client";
import type { BookingClientDto, BookingDto, BookingStatusUpdateDto } from "@/lib/bookings/dto";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
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
    silentMode: true;
    startAtUtc: true;
    endAtUtc: true;
    service: { select: { id: true; name: true } };
  };
}> & {
  proposedStartAt?: Date | null;
  proposedEndAt?: Date | null;
  requestedBy?: "CLIENT" | "MASTER" | null;
  actionRequiredBy?: "CLIENT" | "MASTER" | null;
  changeComment?: string | null;
  clientChangeRequestsCount?: number;
  masterChangeRequestsCount?: number;
};

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
    silentMode: true;
    startAtUtc: true;
    endAtUtc: true;
    service: { select: { id: true; name: true; price: true; durationMin: true } };
    provider: {
      select: {
        id: true;
        name: true;
        district: true;
        address: true;
        type: true;
        publicUsername: true;
        avatarUrl: true;
        cancellationDeadlineHours: true;
      };
    };
    masterProvider: {
      select: {
        id: true;
        name: true;
        district: true;
        address: true;
        type: true;
        publicUsername: true;
        avatarUrl: true;
        cancellationDeadlineHours: true;
      };
    };
  };
}> & {
  proposedStartAt?: Date | null;
  proposedEndAt?: Date | null;
  requestedBy?: "CLIENT" | "MASTER" | null;
  actionRequiredBy?: "CLIENT" | "MASTER" | null;
  changeComment?: string | null;
  clientChangeRequestsCount?: number;
  masterChangeRequestsCount?: number;
};

type BookingStatusModel = { id: string; status: BookingStatusUpdateDto["status"] };

export function toBookingDto(model: BookingWithServiceModel): BookingDto {
  return {
    id: model.id,
    slotLabel: model.slotLabel,
    status: resolveBookingRuntimeStatus({
      status: model.status,
      startAtUtc: model.startAtUtc,
      endAtUtc: model.endAtUtc,
    }),
    providerId: model.providerId,
    masterProviderId: model.masterProviderId ?? null,
    service: {
      id: model.service.id,
      name: model.service.name,
    },
    clientName: model.clientName,
    clientPhone: model.clientPhone,
    comment: model.comment ?? null,
    silentMode: model.silentMode,
    startAtUtc: model.startAtUtc ? toISO(model.startAtUtc) : null,
    endAtUtc: model.endAtUtc ? toISO(model.endAtUtc) : null,
    proposedStartAtUtc: model.proposedStartAt ? toISO(model.proposedStartAt) : null,
    proposedEndAtUtc: model.proposedEndAt ? toISO(model.proposedEndAt) : null,
    requestedBy: model.requestedBy ?? null,
    actionRequiredBy: model.actionRequiredBy ?? null,
    changeComment: model.changeComment ?? null,
    clientChangeRequestsCount: model.clientChangeRequestsCount ?? 0,
    masterChangeRequestsCount: model.masterChangeRequestsCount ?? 0,
  };
}

export function toClientBookingDto(model: BookingWithServiceProviderModel): BookingClientDto {
  return {
    ...toBookingDto(model),
    service: {
      id: model.service.id,
      name: model.service.name,
      price: model.service.price,
      durationMin: model.service.durationMin,
    },
    provider: {
      id: model.provider.id,
      name: model.provider.name,
      district: model.provider.district,
      address: model.provider.address,
      type: model.provider.type,
      publicUsername: model.provider.publicUsername ?? null,
      avatarUrl: model.provider.avatarUrl ?? null,
      cancellationDeadlineHours: model.provider.cancellationDeadlineHours ?? null,
    },
    masterProvider: model.masterProvider
      ? {
          id: model.masterProvider.id,
          name: model.masterProvider.name,
          district: model.masterProvider.district,
          address: model.masterProvider.address,
          type: model.masterProvider.type,
          publicUsername: model.masterProvider.publicUsername ?? null,
          avatarUrl: model.masterProvider.avatarUrl ?? null,
          cancellationDeadlineHours: model.masterProvider.cancellationDeadlineHours ?? null,
        }
      : null,
  };
}

export function toBookingStatusUpdateDto(model: BookingStatusModel): BookingStatusUpdateDto {
  return { id: model.id, status: model.status };
}
