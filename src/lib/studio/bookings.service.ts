import { AppError } from "@/lib/api/errors";
import { normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { confirmBooking } from "@/lib/bookings/confirmBooking";
import { ensureBookingActionWindow, resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import {
  assertMasterPerformsService,
  assertWithinMasterWorkHours,
  type MasterWorkWindow,
} from "@/lib/bookings/policy-enforcement";
import { invalidateSlotsForBookingMove, invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { prisma } from "@/lib/prisma";
import { timeToMinutes } from "@/lib/schedule/time";
import { requireActiveStudioMaster } from "@/lib/studio/master-eligibility";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";

/**
 * STUDIO-RESCHEDULE-VALIDATION-A defaults — used when a master has no
 * `WeeklyScheduleConfig` configured yet. Mirrors the standard
 * Vision-template hours (Mon-Sat 10:00-19:00) so a brand-new studio
 * master doesn't accept arbitrary times silently.
 */
const DEFAULT_WORK_START_MIN = 10 * 60; // 10:00
const DEFAULT_WORK_END_MIN = 19 * 60; // 19:00
/** Sunday off, Mon-Sat working. JS Date.getUTCDay() / getDay(): 0 = Sun. */
const DEFAULT_ACTIVE_DAYS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * STUDIO-RESCHEDULE-VALIDATION-A — resolves the target master's work
 * window for a given weekday by reading the `WeeklyScheduleConfig` +
 * `ScheduleOverride` for the requested date. Returns a normalized
 * `MasterWorkWindow` consumed by the pure
 * `assertWithinMasterWorkHours` helper.
 *
 * Override semantics:
 *   - if a `ScheduleOverride` row exists for `dateKey`, use it
 *     (handles holidays / one-off day-offs / different hours that
 *     day);
 *   - else fall back to the `WeeklyScheduleDay` for `weekday`;
 *   - else fall back to the project-wide defaults above.
 *
 * Per-day overrides take precedence over the weekly config — matches
 * what the schedule engine does at slot-build time.
 */
async function resolveMasterWorkWindow(
  masterProviderId: string,
  newStartLocal: Date,
): Promise<MasterWorkWindow> {
  const weekday = newStartLocal.getUTCDay();
  const dateKey = `${newStartLocal.getUTCFullYear()}-${String(newStartLocal.getUTCMonth() + 1).padStart(2, "0")}-${String(newStartLocal.getUTCDate()).padStart(2, "0")}`;

  const [override, weeklyDay] = await Promise.all([
    prisma.scheduleOverride.findFirst({
      where: { providerId: masterProviderId, date: dateKey },
      include: { template: { select: { startLocal: true, endLocal: true } } },
    }),
    prisma.weeklyScheduleDay.findFirst({
      where: { config: { providerId: masterProviderId }, weekday },
      include: { template: { select: { startLocal: true, endLocal: true } } },
    }),
  ]);

  if (override) {
    if (override.isDayOff) {
      return { isActive: false, startMinutes: null, endMinutes: null };
    }
    const startStr = override.startLocal ?? override.template?.startLocal ?? null;
    const endStr = override.endLocal ?? override.template?.endLocal ?? null;
    if (startStr && endStr) {
      return {
        isActive: true,
        startMinutes: timeToMinutes(startStr),
        endMinutes: timeToMinutes(endStr),
      };
    }
  }

  if (weeklyDay) {
    if (!weeklyDay.isActive) {
      return { isActive: false, startMinutes: null, endMinutes: null };
    }
    const startStr = weeklyDay.template?.startLocal ?? null;
    const endStr = weeklyDay.template?.endLocal ?? null;
    if (startStr && endStr) {
      return {
        isActive: true,
        startMinutes: timeToMinutes(startStr),
        endMinutes: timeToMinutes(endStr),
      };
    }
  }

  // No config — fall back to project-wide default (Mon-Sat 10-19).
  return {
    isActive: DEFAULT_ACTIVE_DAYS.has(weekday),
    startMinutes: DEFAULT_ACTIVE_DAYS.has(weekday) ? DEFAULT_WORK_START_MIN : null,
    endMinutes: DEFAULT_ACTIVE_DAYS.has(weekday) ? DEFAULT_WORK_END_MIN : null,
  };
}

export type MoveStrategy = "KEEP_SERVICE" | "CHANGE_SERVICE";
export type MovePricing = "KEEP_PRICE" | "APPLY_TARGET";

export async function createStudioBooking(input: {
  studioId: string;
  masterId: string;
  startAt: Date;
  serviceId: string;
  clientName: string;
  clientPhone?: string;
  notes?: string;
}): Promise<{ id: string }> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      studioId: studio.id,
    },
    select: {
      id: true,
      name: true,
      title: true,
      price: true,
      durationMin: true,
      basePrice: true,
      baseDurationMin: true,
      isActive: true,
    },
  });
  if (!service || !service.isActive) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }

  // STUDIO-BUGS-FIX-A bug #5: only ACTIVE master can accept bookings.
  const master = await requireActiveStudioMaster({
    studioProviderId: studio.providerId,
    masterId: input.masterId,
  });

  const override = await prisma.masterService.findUnique({
    where: {
      masterProviderId_serviceId: {
        masterProviderId: master.id,
        serviceId: service.id,
      },
    },
    select: {
      isEnabled: true,
      priceOverride: true,
      durationOverrideMin: true,
    },
  });
  if (!override || !override.isEnabled) {
    throw new AppError("Master does not provide this service", 409, "SERVICE_INVALID");
  }

  const durationMin = override.durationOverrideMin ?? service.baseDurationMin ?? service.durationMin;
  const price = override.priceOverride ?? service.basePrice ?? service.price;
  const endAt = new Date(input.startAt.getTime() + durationMin * 60 * 1000);

  // STUDIO-CLIENT-WRITE-DIALOG-A — close the regression-gap from
  // STUDIO-RESCHEDULE-VALIDATION-A: `moveStudioBooking` enforces work
  // hours + slot conflict; `createStudioBooking` had neither. The
  // master-service compatibility was already checked above; the two
  // remaining rules apply identically to create-time.
  //
  //   #1в work-hours: new local time must fit master's window for
  //                   the booking weekday (per-date override > weekly
  //                   config > project defaults).
  //   #1б conflict:   no overlap with another active booking on the
  //                   target master (buffer-aware).
  //
  // Mirrors the reschedule shell — same `resolveMasterWorkWindow`
  // resolver + `assertWithinMasterWorkHours` predicate + inline
  // findMany conflict check (no self-exclusion needed at create
  // time — booking doesn't exist yet).
  const workWindow = await resolveMasterWorkWindow(master.id, input.startAt);
  const startMinutesLocal =
    input.startAt.getUTCHours() * 60 + input.startAt.getUTCMinutes();
  const endMinutesLocal = startMinutesLocal + durationMin;
  assertWithinMasterWorkHours({
    bookingStartMinutes: startMinutesLocal,
    bookingEndMinutes: endMinutesLocal,
    window: workWindow,
  });

  // `requireActiveStudioMaster` only returns ownership/published flags;
  // the buffer column lives on the provider row directly.
  const masterRow = await prisma.provider.findUnique({
    where: { id: master.id },
    select: { bufferBetweenBookingsMin: true },
  });
  const buffer = normalizeBufferMinutes(masterRow?.bufferBetweenBookingsMin);
  const conflicts = await prisma.booking.findMany({
    where: {
      providerId: studio.providerId,
      masterProviderId: master.id,
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      startAtUtc: { not: null },
      endAtUtc: { not: null },
    },
    select: { startAtUtc: true, endAtUtc: true },
  });
  const hasConflict = conflicts.some((row) => {
    if (!row.startAtUtc || !row.endAtUtc) return false;
    const itemStart = buffer
      ? new Date(row.startAtUtc.getTime() - buffer * 60_000)
      : row.startAtUtc;
    const itemEnd = buffer
      ? new Date(row.endAtUtc.getTime() + buffer * 60_000)
      : row.endAtUtc;
    return input.startAt < itemEnd && endAt > itemStart;
  });
  if (hasConflict) {
    throw new AppError(
      "Окошко уже занято у выбранного мастера. Выберите другое время.",
      409,
      "SLOT_CONFLICT",
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        providerId: studio.providerId,
        studioId: studio.id,
        serviceId: service.id,
        masterProviderId: master.id,
        masterId: master.id,
        startAtUtc: input.startAt,
        endAtUtc: endAt,
        startAt: input.startAt,
        endAt,
        slotLabel: input.startAt.toISOString(),
        clientName: input.clientName.trim(),
        clientNameSnapshot: input.clientName.trim(),
        clientPhone: input.clientPhone?.trim() || "",
        clientPhoneSnapshot: input.clientPhone?.trim() || null,
        notes: input.notes?.trim() || null,
        status: "PENDING",
        actionRequiredBy: "MASTER",
        source: "MANUAL",
      },
      select: { id: true },
    });

    await tx.bookingServiceItem.create({
      data: {
        bookingId: booking.id,
        studioId: studio.id,
        serviceId: service.id,
        titleSnapshot: service.title?.trim() || service.name,
        priceSnapshot: price,
        durationSnapshotMin: durationMin,
      },
    });

    return booking;
  });

  await invalidateSlotsForBookingRange({
    providerId: studio.providerId,
    masterProviderId: master.id,
    startAtUtc: input.startAt,
    endAtUtc: endAt,
  });
  await invalidateAdvisorCache(master.id);

  return { id: created.id };
}

export async function moveStudioBooking(input: {
  studioId: string;
  bookingId: string;
  targetMasterId: string;
  targetStartAt: Date;
  strategy: MoveStrategy;
  pricing: MovePricing;
}): Promise<{ id: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      serviceItems: {
        select: {
          id: true,
          serviceId: true,
          durationSnapshotMin: true,
          priceSnapshot: true,
        },
      },
    },
  });
  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }
  if (booking.studioId && booking.studioId !== input.studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  // STUDIO-BUGS-FIX-A bug #5: target master must be ACTIVE.
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }
  await requireActiveStudioMaster({
    studioProviderId: studio.providerId,
    masterId: input.targetMasterId,
  });

  const durationMin = booking.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.durationSnapshotMin),
    0
  );
  const safeDuration = durationMin > 0 ? durationMin : 60;
  const endAt = new Date(input.targetStartAt.getTime() + safeDuration * 60 * 1000);

  // STUDIO-RESCHEDULE-VALIDATION-A — three guards before mutating:
  //   #1а master ↔ service compatibility
  //   #1в work-hours boundary
  //   #1б slot conflict (excluding self)
  // All three throw `AppError` with explicit codes/messages so the
  // studio admin UI can surface targeted feedback. Backend stays the
  // last-resort defense — UI also filters where possible.

  // #1а: target master must have an enabled MasterService for every
  // serviceId on the booking. KEEP_SERVICE leaves the booking on the
  // current service so the new master MUST be able to perform it;
  // CHANGE_SERVICE was the only branch reading MasterService before
  // but only for duration/price update (silently skipped when
  // missing, which let the move proceed onto an incompatible master).
  const bookingServiceIds = Array.from(
    new Set(
      booking.serviceItems
        .map((item) => item.serviceId)
        .filter((sid): sid is string => Boolean(sid)),
    ),
  );
  if (bookingServiceIds.length > 0) {
    const enabledRows = await prisma.masterService.findMany({
      where: {
        masterProviderId: input.targetMasterId,
        serviceId: { in: bookingServiceIds },
        isEnabled: true,
      },
      select: { serviceId: true },
    });
    const enabledSet = new Set(enabledRows.map((row) => row.serviceId));
    const allMatched = bookingServiceIds.every((sid) => enabledSet.has(sid));
    assertMasterPerformsService({ hasEnabledMasterService: allMatched });
  }

  // #1в: new time must lie within target master's work window for
  // that weekday (per-date override > weekly config > defaults).
  const workWindow = await resolveMasterWorkWindow(
    input.targetMasterId,
    input.targetStartAt,
  );
  const startMinutesLocal =
    input.targetStartAt.getUTCHours() * 60 + input.targetStartAt.getUTCMinutes();
  const endMinutesLocal = startMinutesLocal + safeDuration;
  assertWithinMasterWorkHours({
    bookingStartMinutes: startMinutesLocal,
    bookingEndMinutes: endMinutesLocal,
    window: workWindow,
  });

  // #1б: ensure no overlap with another active booking on the target
  // master, EXCLUDING this booking itself (so a move-to-same-time
  // no-op doesn't conflict with self).
  const masterRow = await prisma.provider.findUnique({
    where: { id: input.targetMasterId },
    select: { bufferBetweenBookingsMin: true },
  });
  const buffer = normalizeBufferMinutes(masterRow?.bufferBetweenBookingsMin);
  const conflictWhere = {
    providerId: booking.providerId,
    masterProviderId: input.targetMasterId,
  };
  const conflicts = await prisma.booking.findMany({
    where: {
      ...conflictWhere,
      id: { not: booking.id },
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      startAtUtc: { not: null },
      endAtUtc: { not: null },
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
  });
  const newStart = input.targetStartAt;
  const newEnd = endAt;
  const hasConflict = conflicts.some((row) => {
    if (!row.startAtUtc || !row.endAtUtc) return false;
    const itemStart = buffer
      ? new Date(row.startAtUtc.getTime() - buffer * 60_000)
      : row.startAtUtc;
    const itemEnd = buffer
      ? new Date(row.endAtUtc.getTime() + buffer * 60_000)
      : row.endAtUtc;
    return newStart < itemEnd && newEnd > itemStart;
  });
  if (hasConflict) {
    throw new AppError(
      "Окошко уже занято у выбранного мастера. Выберите другое время.",
      409,
      "SLOT_CONFLICT",
    );
  }
  const previousStartAtUtc = booking.startAtUtc;
  const previousEndAtUtc = booking.endAtUtc;
  const previousMasterProviderId = booking.masterProviderId;

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        studioId: input.studioId,
        masterProviderId: input.targetMasterId,
        masterId: input.targetMasterId,
        startAtUtc: input.targetStartAt,
        endAtUtc: endAt,
        startAt: input.targetStartAt,
        endAt,
      },
    });

    if (input.strategy === "CHANGE_SERVICE" || input.pricing === "APPLY_TARGET") {
      const serviceIds = Array.from(
        new Set(booking.serviceItems.map((item) => item.serviceId).filter((serviceId): serviceId is string => Boolean(serviceId)))
      );
      const overrides =
        serviceIds.length > 0
          ? await tx.masterService.findMany({
              where: {
                masterProviderId: input.targetMasterId,
                serviceId: { in: serviceIds },
              },
              select: {
                serviceId: true,
                isEnabled: true,
                priceOverride: true,
                durationOverrideMin: true,
                service: { select: { price: true, durationMin: true } },
              },
            })
          : [];
      const overrideByServiceId = new Map(overrides.map((override) => [override.serviceId, override]));

      for (const item of booking.serviceItems) {
        if (!item.serviceId) continue;
        const override = overrideByServiceId.get(item.serviceId);

        if (!override || !override.isEnabled) continue;

        await tx.bookingServiceItem.update({
          where: { id: item.id },
          data: {
            durationSnapshotMin:
              input.strategy === "CHANGE_SERVICE"
                ? override.durationOverrideMin ?? override.service.durationMin
                : item.durationSnapshotMin,
            priceSnapshot:
              input.pricing === "APPLY_TARGET"
                ? override.priceOverride ?? override.service.price
                : item.priceSnapshot,
          },
        });
      }
    }
  });

  await invalidateSlotsForBookingMove({
    previous: {
      providerId: booking.providerId,
      masterProviderId: previousMasterProviderId ?? null,
      startAtUtc: previousStartAtUtc,
      endAtUtc: previousEndAtUtc,
    },
    next: {
      providerId: booking.providerId,
      masterProviderId: input.targetMasterId,
      startAtUtc: input.targetStartAt,
      endAtUtc: endAt,
    },
  });

  return { id: booking.id };
}

export async function updateMasterBookingStatus(input: {
  bookingId: string;
  masterId: string;
  status: "CONFIRMED" | "REJECTED" | "CANCELLED" | "NO_SHOW";
  comment?: string;
}): Promise<{ id: string; status: string }> {
  // AUDIT (мастерские действия по статусу):
  // - реализовано: подтверждение PENDING и подтверждение клиентского CHANGE_REQUESTED.
  // - реализовано: отклонение initial booking -> REJECTED с обязательным комментарием.
  // - реализовано: отклонение клиентского переноса оставляет CONFIRMED и очищает proposed*.
  // - не реализовано в этом обработчике: мастерский запрос переноса (MASTER -> CHANGE_REQUESTED) выполняется другим usecase.
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      providerId: true,
      masterProviderId: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      requestedBy: true,
      actionRequiredBy: true,
    },
  });
  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }
  const belongsToMaster =
    booking.masterProviderId === input.masterId ||
    (booking.masterProviderId === null && booking.providerId === input.masterId);
  if (!belongsToMaster) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  if (input.status === "CONFIRMED") {
    const confirmed = await confirmBooking(booking.id, "MASTER");
    return { id: confirmed.id, status: confirmed.status };
  }

  if (runtimeStatus === "REJECTED") {
    throw new AppError("Booking is in terminal state", 409, "VALIDATION_ERROR");
  }

  if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
    throw new AppError("Booking already started", 409, "CONFLICT");
  }

  const isRejectAction = input.status === "REJECTED";
  const isCancelAction = input.status === "CANCELLED";
  const comment = input.comment?.trim() ?? "";
  const rejectsChangeRequest =
    isRejectAction &&
    runtimeStatus === "CHANGE_REQUESTED" &&
    booking.requestedBy === "CLIENT" &&
    booking.actionRequiredBy === "MASTER";

  if (!rejectsChangeRequest && (isRejectAction || isCancelAction)) {
    ensureBookingActionWindow(booking.startAtUtc);
  }

  if (!rejectsChangeRequest && (isRejectAction || isCancelAction) && comment.length === 0) {
    throw new AppError("Comment is required", 400, "VALIDATION_ERROR");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: rejectsChangeRequest
        ? {
            status: "CONFIRMED",
            proposedStartAt: null,
            proposedEndAt: null,
            requestedBy: null,
            actionRequiredBy: null,
            changeComment: null,
          }
        : {
            status: input.status,
            cancelledBy: "PROVIDER",
            cancelReason: comment || null,
            cancelledAtUtc: new Date(),
            requestedBy: "MASTER",
            actionRequiredBy: null,
            proposedStartAt: null,
            proposedEndAt: null,
            changeComment: comment || null,
          },
      select: { id: true, status: true },
    });

    return updated;
  });

  if (!rejectsChangeRequest) {
    await invalidateSlotsForBookingRange({
      providerId: booking.providerId,
      masterProviderId: booking.masterProviderId ?? null,
      startAtUtc: booking.startAtUtc,
      endAtUtc: booking.endAtUtc,
    });
  }

  return { id: updated.id, status: updated.status };
}
