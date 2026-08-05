import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { buildConflictScopeWhere, normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { applyBookingTransition } from "@/lib/bookings/transition";
import { confirmBooking } from "@/lib/bookings/confirmBooking";
import { declineClientRescheduleRequest } from "@/lib/bookings/decline-reschedule";
import { ensureBookingActionWindow, resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import {
  assertMasterPerformsService,
  assertWithinMasterWorkHours,
  resolveSalonLocalParts,
} from "@/lib/bookings/policy-enforcement";
import { invalidateSlotsForBookingMove, invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { prisma } from "@/lib/prisma";
import { resolveMasterWorkWindow } from "@/lib/schedule/master-work-window";
import { requireActiveStudioMaster } from "@/lib/studio/master-eligibility";
import { assertBelongsToStudio } from "@/lib/studio/tenancy";
import { resolveMoveDurationMin, resolveMoveItemDurationMin } from "@/lib/studio/move-duration";
import { assertNoTimeBlockConflict } from "@/lib/schedule/time-blocks";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";

/**
 * STUDIO-RESCHEDULE-VALIDATION-A defaults — used when a master has no
 * `WeeklyScheduleConfig` configured yet. Mirrors the standard
 * Vision-template hours (Mon-Sat 10:00-19:00) so a brand-new studio
 * master doesn't accept arbitrary times silently.
 */
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
    throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
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
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
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
    throw new AppError("Мастер не выполняет эту услугу.", 409, "SERVICE_INVALID");
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
  // FIX-R2-04-B: read the booking instant in the SALON timezone (the
  // master provider's tz) before the work-hours comparison.
  // `getUTCHours()` on a real-UTC instant is the salon's UTC offset off
  // the salon-local window, so a non-UTC studio's window was shifted —
  // wrongly allowing out-of-hours + wrongly rejecting in-hours creates.
  const salonTz = master.timezone;
  const localStart = resolveSalonLocalParts(input.startAt, salonTz);
  const workWindow = await resolveMasterWorkWindow(
    master.id,
    localStart.weekday,
    localStart.dateKey,
  );
  const startMinutesLocal = localStart.minutesFromMidnight;
  const endMinutesLocal = startMinutesLocal + durationMin;
  assertWithinMasterWorkHours({
    bookingStartMinutes: startMinutesLocal,
    bookingEndMinutes: endMinutesLocal,
    window: workWindow,
  });

  // `requireActiveStudioMaster` only returns ownership/published/tz
  // flags; the buffer column lives on the provider row directly. Buffer
  // resolution is a pure config read + arithmetic, so it stays OUTSIDE
  // the transaction (mirrors FIX-R2-01-B `confirmBooking`).
  const masterRow = await prisma.provider.findUnique({
    where: { id: master.id },
    select: { bufferBetweenBookingsMin: true },
  });
  const buffer = normalizeBufferMinutes(masterRow?.bufferBetweenBookingsMin);

  // FIX-R2-04-A: the conflict re-check now runs INSIDE the create
  // transaction under Serializable isolation (was pre-tx with default
  // isolation → TOCTOU: two concurrent creates onto overlapping slots
  // could both pass a pre-check and both commit → double-book). Mirrors
  // `createBooking` / FIX-R2-01-B `confirmBooking`: only the
  // conflict-detection READ + the WRITEs must share one Serializable
  // snapshot. Same buffer-aware overlap primitive — no new conflict
  // definition (no self-exclusion needed: the booking doesn't exist
  // yet at create time).
  let created: { id: string };
  try {
    created = await prisma.$transaction(
      async (tx) => {
        // LOGIC-01: скоуп — из общего билдера. Пара `(providerId студии,
        // masterProviderId)` не видела брони ТОГО ЖЕ мастера, созданные через
        // его личный профиль (`providerId = мастер`), поэтому админ студии
        // создавал бронь поверх существующей БЕЗ всякой гонки — у этого пути
        // вдобавок нет предварительной availability-проверки, и in-tx предикат
        // был его единственной защитой.
        const conflicts = await tx.booking.findMany({
          where: {
            ...buildConflictScopeWhere({
              providerId: studio.providerId,
              masterProviderId: master.id,
            }),
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

        // FIX-TIMEBLOCK-ENFORCEMENT-01: studio admin create is direct authority
        // (#22) but still cannot land on a TimeBlock the master is closed for.
        await assertNoTimeBlockConflict(tx, {
          masterProviderId: master.id,
          startAtUtc: input.startAt,
          endAtUtc: endAt,
        });

        const booking = await tx.booking.create({
          data: {
            providerId: studio.providerId,
            studioId: studio.id,
            serviceId: service.id,
            masterProviderId: master.id,
            masterId: master.id,
            startAtUtc: input.startAt,
            endAtUtc: endAt,
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // A true-concurrent create race surfaces under Serializable as a
    // write-conflict / serialization failure (P2034) or a unique race
    // (P2002) at COMMIT time. Map it to the same retryable 409 the
    // in-tx predicate throws — never a 500 (mirrors confirmBooking /
    // createBooking's mapPrismaBookingConflict).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      throw new AppError(
        "Окошко уже занято у выбранного мастера. Выберите другое время.",
        409,
        "SLOT_CONFLICT",
      );
    }
    throw error;
  }

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
    throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");
  }
  // SECURITY-EXPOSURE-AUDIT-01 #1 (R1d): the guard was null-permissive
  // (`booking.studioId && …`), so a solo-master booking (studioId === null)
  // could be seized by any studio. Assert the booking belongs to this studio —
  // a null / foreign studioId is rejected.
  await assertBelongsToStudio("booking", input.bookingId, input.studioId);

  // STUDIO-BUGS-FIX-A bug #5: target master must be ACTIVE.
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { providerId: true },
  });
  if (!studio) {
    throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
  }
  const targetMaster = await requireActiveStudioMaster({
    studioProviderId: studio.providerId,
    masterId: input.targetMasterId,
  });

  // STUDIO-RESCHEDULE-VALIDATION-A — three guards before mutating:
  //   #1а master ↔ service compatibility
  //   #1в work-hours boundary
  //   #1б slot conflict (excluding self)
  // All three throw `AppError` with explicit codes/messages so the
  // studio admin UI can surface targeted feedback. Backend stays the
  // last-resort defense — UI also filters where possible.

  // FIX-6 (HARDENING-04): resolve the TARGET master's per-service
  // duration/price ONCE, up front, and derive the move window from it.
  // Previously `endAt` (hence the conflict check + stored `endAtUtc`) was
  // computed from the OLD service durations, while CHANGE_SERVICE rewrote
  // `durationSnapshotMin` to the (possibly LONGER) target afterwards WITHOUT
  // recomputing `endAtUtc` — the extra tail minutes were unprotected → a
  // second booking could land inside the tail (double-book). Resolving once
  // here (and reusing the same map + helper for the snapshot write below)
  // keeps the checked window, the stored `endAtUtc`, and the stored
  // `durationSnapshotMin` provably identical.
  const bookingServiceIds = Array.from(
    new Set(
      booking.serviceItems
        .map((item) => item.serviceId)
        .filter((sid): sid is string => Boolean(sid)),
    ),
  );
  const targetOverrides =
    bookingServiceIds.length > 0
      ? await prisma.masterService.findMany({
          where: {
            masterProviderId: input.targetMasterId,
            serviceId: { in: bookingServiceIds },
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
  const overrideByServiceId = new Map(
    targetOverrides.map((override) => [override.serviceId, override]),
  );

  // #1а: target master must have an enabled MasterService for every serviceId
  // on the booking (both strategies — KEEP_SERVICE keeps the current service,
  // so the new master MUST still be able to perform it).
  if (bookingServiceIds.length > 0) {
    const allMatched = bookingServiceIds.every((sid) => {
      const override = overrideByServiceId.get(sid);
      return Boolean(override && override.isEnabled);
    });
    assertMasterPerformsService({ hasEnabledMasterService: allMatched });
  }

  // Window duration = what this move will PERSIST (CHANGE_SERVICE → target
  // durations, KEEP_SERVICE → current snapshots), so the validated/stored
  // `endAtUtc` equals the `durationSnapshotMin` written in the transaction.
  const durationMin = resolveMoveDurationMin(
    booking.serviceItems,
    input.strategy,
    overrideByServiceId,
  );
  const safeDuration = durationMin > 0 ? durationMin : 60;
  const endAt = new Date(input.targetStartAt.getTime() + safeDuration * 60 * 1000);

  // #1в: new time must lie within target master's work window for
  // that weekday (per-date override > weekly config > defaults).
  // FIX-R2-04-B: derive weekday/dateKey/minutes in the SALON timezone
  // (the target master provider's tz). getUTCHours() / getUTCDay() on
  // the real-UTC instant offset the window by the salon's UTC offset —
  // for a +5 Almaty 10-19 salon the guard wrongly ALLOWED a 20:00 local
  // move (read as 15:00 UTC, "in window") and wrongly REJECTED an 11:00
  // local one (read as 06:00 UTC, "before open").
  const salonTz = targetMaster.timezone;
  const localStart = resolveSalonLocalParts(input.targetStartAt, salonTz);
  const workWindow = await resolveMasterWorkWindow(
    input.targetMasterId,
    localStart.weekday,
    localStart.dateKey,
  );
  const startMinutesLocal = localStart.minutesFromMidnight;
  const endMinutesLocal = startMinutesLocal + safeDuration;
  assertWithinMasterWorkHours({
    bookingStartMinutes: startMinutesLocal,
    bookingEndMinutes: endMinutesLocal,
    window: workWindow,
  });

  // #1б: ensure no overlap with another active booking on the target
  // master, EXCLUDING this booking itself (so a move-to-same-time
  // no-op doesn't conflict with self). Buffer + the new window are
  // pure config reads + arithmetic → resolved OUTSIDE the tx (mirrors
  // FIX-R2-01-B `confirmBooking`).
  const masterRow = await prisma.provider.findUnique({
    where: { id: input.targetMasterId },
    select: { bufferBetweenBookingsMin: true },
  });
  const buffer = normalizeBufferMinutes(masterRow?.bufferBetweenBookingsMin);
  const newStart = input.targetStartAt;
  const newEnd = endAt;
  const previousStartAtUtc = booking.startAtUtc;
  const previousEndAtUtc = booking.endAtUtc;
  const previousMasterProviderId = booking.masterProviderId;

  // FIX-R2-04-A: the conflict re-check now runs INSIDE the move
  // transaction under Serializable isolation (was pre-tx with default
  // isolation → TOCTOU: a concurrent create/move onto the same target
  // slot in the window could double-book). Mirrors FIX-R2-01-B
  // `confirmBooking`: only the conflict-detection READ + the WRITEs must
  // share one Serializable snapshot. Same buffer-aware overlap
  // primitive — no new conflict definition. The exclude-self filter
  // (`id: { not: booking.id }`) is preserved so a shift that overlaps
  // the booking's OWN current slot doesn't false-conflict.
  try {
    await prisma.$transaction(
      async (tx) => {
        // LOGIC-01: тот же скоуп, что у create. Exclude-self сохранён — при
        // переносе бронь ещё занимает свой старый слот.
        const conflicts = await tx.booking.findMany({
          where: {
            ...buildConflictScopeWhere({
              providerId: booking.providerId,
              masterProviderId: input.targetMasterId,
            }),
            id: { not: booking.id },
            status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
            startAtUtc: { not: null },
            endAtUtc: { not: null },
          },
          select: { id: true, startAtUtc: true, endAtUtc: true },
        });
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

        // FIX-TIMEBLOCK-ENFORCEMENT-01: a move must not drop the booking into a
        // window the TARGET master is closed for (block owner = target master).
        await assertNoTimeBlockConflict(tx, {
          masterProviderId: input.targetMasterId,
          startAtUtc: newStart,
          endAtUtc: newEnd,
        });

        await tx.booking.update({
          where: { id: booking.id },
          data: {
            studioId: input.studioId,
            masterProviderId: input.targetMasterId,
            masterId: input.targetMasterId,
            startAtUtc: input.targetStartAt,
            endAtUtc: endAt,
          },
        });

        if (input.strategy === "CHANGE_SERVICE" || input.pricing === "APPLY_TARGET") {
          // FIX-6: reuse the overrides resolved up front (the same map that
          // sized the validated/stored `endAtUtc` window) and the same
          // duration helper — no divergent in-tx re-fetch, so the persisted
          // `durationSnapshotMin` equals the checked window by construction.
          for (const item of booking.serviceItems) {
            if (!item.serviceId) continue;
            const override = overrideByServiceId.get(item.serviceId);

            if (!override || !override.isEnabled) continue;

            await tx.bookingServiceItem.update({
              where: { id: item.id },
              data: {
                durationSnapshotMin: resolveMoveItemDurationMin(
                  item,
                  input.strategy,
                  overrideByServiceId,
                ),
                priceSnapshot:
                  input.pricing === "APPLY_TARGET"
                    ? override.priceOverride ?? override.service.price
                    : item.priceSnapshot,
              },
            });
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // A true-concurrent move/create race surfaces under Serializable as
    // a write-conflict / serialization failure (P2034) or a unique race
    // (P2002) at COMMIT time. Map it to the same retryable 409 the in-tx
    // predicate throws — never a 500 (mirrors confirmBooking).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      throw new AppError(
        "Окошко уже занято у выбранного мастера. Выберите другое время.",
        409,
        "SLOT_CONFLICT",
      );
    }
    throw error;
  }

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
      // LOGIC-04: принадлежность пакету — guard «пакет отменяется целиком»
      // (инв. #34) стоял только на клиентском пути.
      bookingPackageId: true,
      requestedBy: true,
      actionRequiredBy: true,
    },
  });
  if (!booking) {
    throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");
  }
  const belongsToMaster =
    booking.masterProviderId === input.masterId ||
    (booking.masterProviderId === null && booking.providerId === input.masterId);
  if (!belongsToMaster) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
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
    throw new AppError("Запись уже завершена — изменить её нельзя.", 409, "VALIDATION_ERROR");
  }

  if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
    throw new AppError("Запись уже началась.", 409, "CONFLICT");
  }

  const isRejectAction = input.status === "REJECTED";
  const isCancelAction = input.status === "CANCELLED";
  const comment = input.comment?.trim() ?? "";
  const rejectsChangeRequest =
    isRejectAction &&
    runtimeStatus === "CHANGE_REQUESTED" &&
    booking.requestedBy === "CLIENT" &&
    booking.actionRequiredBy === "MASTER";

  // FIX-R2-06-A: declining a client-proposed reschedule reverts to the original
  // time (no move, no slot change). Shared with the studio decline route so the
  // two paths can't drift.
  if (rejectsChangeRequest) {
    return declineClientRescheduleRequest(booking.id, "MASTER");
  }

  // LOGIC-04: компонент пакета нельзя отменить в одиночку — ни клиентом, ни
  // мастером. Клиентский путь (`cancelBooking`) это проверял, мастерский —
  // параллельная реализация, до `cancelBooking` не доходящая вовсе, — не
  // проверял, и пакет оставался ACTIVE с одним REJECTED-ребёнком: Σ child
  // `priceSnapshot` переставала сходиться с `totalKopeks`, то есть клиент
  // платил пакетную скидку за услуги, часть которых отменена.
  //
  // Отказ, а не «отменить пакет целиком за мастера»: «отмена только целиком,
  // не по частям» — ратифицированное продуктовое решение (§1 контекста,
  // инв. #34), а тихая отмена ОСТАЛЬНЫХ компонентов по клику «отменить эту
  // запись» была бы новым поведением, которого мастер не запрашивал. Текст и
  // код ответа — те же, что на клиентском пути.
  //
  // `NO_SHOW` намеренно НЕ гейтится: неявка на один компонент — законный исход
  // (клиент пришёл на первую услугу и не пришёл на вторую), она ничего не
  // отменяет и Σ снапшотов не трогает.
  if ((isRejectAction || isCancelAction) && booking.bookingPackageId) {
    throw new AppError("Этот пакет отменяется целиком.", 409, "PACKAGE_CANCEL_WHOLE", {
      bookingPackageId: booking.bookingPackageId,
    });
  }

  if (isRejectAction || isCancelAction) {
    ensureBookingActionWindow(booking.startAtUtc);
  }

  if ((isRejectAction || isCancelAction) && comment.length === 0) {
    throw new AppError("Укажите комментарий.", 400, "VALIDATION_ERROR");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // LOGIC-02: переход только из наблюдённого статуса.
    const updated = await applyBookingTransition(tx, {
      id: booking.id,
      expectedStatus: booking.status,
      data: {
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

  await invalidateSlotsForBookingRange({
    providerId: booking.providerId,
    masterProviderId: booking.masterProviderId ?? null,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  return { id: updated.id, status: updated.status };
}
