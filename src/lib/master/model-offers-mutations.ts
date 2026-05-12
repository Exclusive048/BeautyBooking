import { ModelApplicationStatus, ModelOfferStatus, Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { resolveMasterAccess } from "@/lib/model-offers/access";
import {
  loadApplicationWithRelations,
  notifyModelApplicationRejected,
} from "@/lib/notifications/model-notifications";
import { prisma } from "@/lib/prisma";
import { dateFromKey, minutesToTime, parseTime, timeToMinutes } from "@/lib/schedule/time";
import { toUtcFromLocalDateTime } from "@/lib/schedule/timezone";

/**
 * Domain helpers for 29b model-offers mutations. Both endpoint flavours
 * (`PATCH /[id]` with `status: CLOSED` and `POST /[id]/close`) funnel
 * through `closeOfferWithCascade` so cascade-reject behaviour stays in
 * one place. `computeAvailableTimeSlots` powers the propose-time modal.
 */

const CLOSE_REASON = "Оффер закрыт";
const PROPOSE_SLOT_STEP_MIN = 30;
const ACTIVE_BOOKING_STATUSES: Array<
  "NEW" | "PENDING" | "CONFIRMED" | "CHANGE_REQUESTED" | "IN_PROGRESS" | "PREPAID" | "STARTED" | "FINISHED"
> = ["NEW", "PENDING", "CONFIRMED", "CHANGE_REQUESTED", "IN_PROGRESS", "PREPAID", "STARTED", "FINISHED"];

export type CloseOfferResult = {
  offerId: string;
  cascadedCount: number;
};

/**
 * Move offer ACTIVE → CLOSED and cascade-reject every still-pending
 * application (PENDING + APPROVED_WAITING_CLIENT) with a reason
 * "Оффер закрыт". Notifications are fired post-transaction so a flaky
 * notifier doesn't roll back the state change.
 *
 * Idempotent: a re-run on an already-CLOSED offer is a no-op (returns
 * cascadedCount: 0). Throws AppError(404) when the offer is missing or
 * the master can't access it; 409 when the offer is ARCHIVED.
 */
export async function closeOfferWithCascade(input: {
  offerId: string;
  userId: string;
}): Promise<CloseOfferResult> {
  const offer = await prisma.modelOffer.findUnique({
    where: { id: input.offerId },
    select: { id: true, masterId: true, status: true },
  });
  if (!offer) {
    throw new AppError("Offer not found", 404, "NOT_FOUND");
  }
  await resolveMasterAccess(offer.masterId, input.userId);

  if (offer.status === ModelOfferStatus.ARCHIVED) {
    throw new AppError("Offer is archived", 409, "CONFLICT");
  }
  if (offer.status === ModelOfferStatus.CLOSED) {
    return { offerId: offer.id, cascadedCount: 0 };
  }

  const cascadedIds = await prisma.$transaction(async (tx) => {
    const pending = await tx.modelApplication.findMany({
      where: {
        offerId: offer.id,
        status: { in: [ModelApplicationStatus.PENDING, ModelApplicationStatus.APPROVED_WAITING_CLIENT] },
      },
      select: { id: true },
    });

    if (pending.length > 0) {
      await tx.modelApplication.updateMany({
        where: { id: { in: pending.map((row) => row.id) } },
        data: {
          status: ModelApplicationStatus.REJECTED,
          proposedTimeLocal: null,
          confirmedStartAt: null,
        },
      });
    }

    await tx.modelOffer.update({
      where: { id: offer.id },
      data: { status: ModelOfferStatus.CLOSED },
    });

    return pending.map((row) => row.id);
  });

  for (const applicationId of cascadedIds) {
    const application = await loadApplicationWithRelations(applicationId);
    if (application) {
      await notifyModelApplicationRejected(application, CLOSE_REASON);
    }
  }

  return { offerId: offer.id, cascadedCount: cascadedIds.length };
}

export type AvailableTimeSlot = {
  startLocal: string;
};

/**
 * Enumerate 30-min slots inside the offer's `[timeRangeStart, timeRangeEnd]`
 * window, dropping those that overlap any of the master's existing
 * bookings (with the master's `bufferBetweenBookingsMin`).
 *
 * Used by the propose-time modal — the master picks a concrete slot and
 * we forward it to the existing `propose-time` endpoint.
 *
 * Notes:
 *   - Slot must fit both: `start + serviceDuration` ≤ `timeRangeEnd`.
 *   - Service duration = base duration + offer.extraBusyMin (matches what
 *     the client confirm flow uses to size the booking).
 *   - Cancelled / rejected / no-show bookings are ignored.
 */
export async function computeAvailableTimeSlots(input: {
  offerId: string;
  userId: string;
  now?: Date;
}): Promise<{ slots: AvailableTimeSlot[]; offer: { dateLocal: string; startLocal: string; endLocal: string } }> {
  const now = input.now ?? new Date();

  const offer = await prisma.modelOffer.findUnique({
    where: { id: input.offerId },
    select: {
      id: true,
      masterId: true,
      dateLocal: true,
      timeRangeStartLocal: true,
      timeRangeEndLocal: true,
      extraBusyMin: true,
      master: {
        select: {
          id: true,
          timezone: true,
          bufferBetweenBookingsMin: true,
        },
      },
      masterService: {
        select: {
          durationOverrideMin: true,
          service: {
            select: { durationMin: true, baseDurationMin: true },
          },
        },
      },
      service: {
        select: { durationMin: true, baseDurationMin: true },
      },
    },
  });
  if (!offer) {
    throw new AppError("Offer not found", 404, "NOT_FOUND");
  }
  await resolveMasterAccess(offer.masterId, input.userId);

  const baseService = offer.masterService?.service ?? offer.service;
  if (!baseService) {
    return {
      slots: [],
      offer: {
        dateLocal: offer.dateLocal,
        startLocal: offer.timeRangeStartLocal,
        endLocal: offer.timeRangeEndLocal,
      },
    };
  }
  const baseDuration =
    offer.masterService?.durationOverrideMin ?? baseService.baseDurationMin ?? baseService.durationMin;
  const totalDuration = baseDuration + Math.max(0, offer.extraBusyMin ?? 0);

  const startMin = timeToMinutes(offer.timeRangeStartLocal);
  const endMin = timeToMinutes(offer.timeRangeEndLocal);
  if (startMin === null || endMin === null || startMin >= endMin) {
    return {
      slots: [],
      offer: {
        dateLocal: offer.dateLocal,
        startLocal: offer.timeRangeStartLocal,
        endLocal: offer.timeRangeEndLocal,
      },
    };
  }
  if (totalDuration <= 0 || endMin - startMin < totalDuration) {
    return {
      slots: [],
      offer: {
        dateLocal: offer.dateLocal,
        startLocal: offer.timeRangeStartLocal,
        endLocal: offer.timeRangeEndLocal,
      },
    };
  }

  const candidates: number[] = [];
  for (let cursor = startMin; cursor + totalDuration <= endMin; cursor += PROPOSE_SLOT_STEP_MIN) {
    candidates.push(cursor);
  }

  const date = dateFromKey(offer.dateLocal);
  if (!date) {
    return {
      slots: [],
      offer: {
        dateLocal: offer.dateLocal,
        startLocal: offer.timeRangeStartLocal,
        endLocal: offer.timeRangeEndLocal,
      },
    };
  }

  const tz = offer.master.timezone || "Europe/Moscow";
  const dayStartUtc = toUtcFromLocalDateTime(date, 0, 0, tz);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60_000);

  const buffer = Math.max(0, Math.min(30, offer.master.bufferBetweenBookingsMin ?? 0));

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { providerId: offer.masterId },
        { masterProviderId: offer.masterId },
      ],
      status: { in: ACTIVE_BOOKING_STATUSES as Prisma.EnumBookingStatusFilter["in"] },
      startAtUtc: { not: null, lt: dayEndUtc },
      endAtUtc: { not: null, gt: dayStartUtc },
    },
    select: { startAtUtc: true, endAtUtc: true },
  });

  const isPast = (cursorMin: number): boolean => {
    const parts = parseTime(minutesToTime(cursorMin));
    if (!parts) return false;
    const slotStart = toUtcFromLocalDateTime(date, parts.hours, parts.minutes, tz);
    return slotStart.getTime() <= now.getTime();
  };

  const conflictsWithBooking = (cursorMin: number): boolean => {
    const parts = parseTime(minutesToTime(cursorMin));
    if (!parts) return true;
    const slotStart = toUtcFromLocalDateTime(date, parts.hours, parts.minutes, tz);
    const slotEnd = new Date(slotStart.getTime() + totalDuration * 60_000);
    const bufferedSlotStart = new Date(slotStart.getTime() - buffer * 60_000);
    const bufferedSlotEnd = new Date(slotEnd.getTime() + buffer * 60_000);

    for (const booking of bookings) {
      if (!booking.startAtUtc || !booking.endAtUtc) continue;
      if (booking.startAtUtc < bufferedSlotEnd && booking.endAtUtc > bufferedSlotStart) {
        return true;
      }
    }
    return false;
  };

  const slots: AvailableTimeSlot[] = [];
  for (const cursor of candidates) {
    if (isPast(cursor)) continue;
    if (conflictsWithBooking(cursor)) continue;
    slots.push({ startLocal: minutesToTime(cursor) });
  }

  return {
    slots,
    offer: {
      dateLocal: offer.dateLocal,
      startLocal: offer.timeRangeStartLocal,
      endLocal: offer.timeRangeEndLocal,
    },
  };
}
