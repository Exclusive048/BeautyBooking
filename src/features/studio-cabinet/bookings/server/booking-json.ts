import type { BookingSource, BookingStatus } from "@prisma/client";
import { resolveBookingRuntimeStatus, type BookingRuntimeStatus } from "@/lib/bookings/flow";
import {
  resolveStudioBookingActions,
  studioBookingNeedsAnswer,
  type StudioBookingActions,
} from "@/lib/bookings/studio-actions";
import type { StudioBookingRow } from "./types";

/**
 * MOBILE-STUDIO-C (ops) — запись студии в списках приложения (главная
 * «ждут ответа», журнал). Строится из строки журнала веба (`listStudioBookings`),
 * но без телефона клиента: телефон — только в карточке записи.
 */
export type StudioBookingListItem = {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMin: number;
  status: BookingStatus;
  runtimeStatus: BookingRuntimeStatus;
  source: BookingSource;
  master: {
    id: string;
    name: string;
    avatarUrl: string | null;
    specialization: string | null;
  };
  client: {
    name: string;
    isNewClient: boolean;
    isVip: boolean;
  };
  serviceId: string;
  serviceTitle: string;
  priceKopeks: number;
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  bookingPackageId: string | null;
  needsAnswer: boolean;
  actions: StudioBookingActions;
};

function parseIso(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Длительность по времени записи; если оно битое — длительность услуги. */
function durationMinutes(start: Date | null, end: Date | null, fallback: number): number {
  if (start && end && end.getTime() > start.getTime()) {
    return Math.round((end.getTime() - start.getTime()) / 60_000);
  }
  return Math.max(0, fallback);
}

export function toStudioBookingListItem(row: StudioBookingRow, now: Date): StudioBookingListItem {
  const startAt = parseIso(row.startAtUtc);
  const endAt = parseIso(row.endAtUtc);
  const proposedStartAt = parseIso(row.proposedStartAtUtc);
  const proposedEndAt = parseIso(row.proposedEndAtUtc);
  const actions = resolveStudioBookingActions({
    status: row.status,
    startAtUtc: startAt,
    endAtUtc: endAt,
    actionRequiredBy: row.actionRequiredBy,
    proposedStartAt,
    proposedEndAt,
    bookingPackageId: row.bookingPackageId,
    now,
  });

  return {
    id: row.id,
    startAtUtc: row.startAtUtc,
    endAtUtc: row.endAtUtc,
    durationMin: durationMinutes(startAt, endAt, row.service.durationMin),
    status: row.status,
    runtimeStatus: resolveBookingRuntimeStatus({ status: row.status, startAtUtc: startAt, endAtUtc: endAt, now }),
    source: row.source,
    master: {
      id: row.master.id,
      name: row.master.displayName,
      avatarUrl: row.master.avatarUrl,
      specialization: row.master.specialization.trim() || null,
    },
    client: {
      name: row.client.displayName,
      isNewClient: row.client.isNewClient,
      isVip: row.client.isVip,
    },
    serviceId: row.serviceId,
    serviceTitle: row.service.name,
    priceKopeks: row.priceKopeks,
    proposedStartAtUtc: row.proposedStartAtUtc,
    proposedEndAtUtc: row.proposedEndAtUtc,
    actionRequiredBy: row.actionRequiredBy,
    bookingPackageId: row.bookingPackageId,
    needsAnswer: studioBookingNeedsAnswer(actions),
    actions,
  };
}
