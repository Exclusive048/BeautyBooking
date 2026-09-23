import { BookingSource, Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { createBookingRow } from "@/lib/bookings/booking-row";
import { bookingTransaction } from "@/lib/bookings/booking-transaction";
import {
  buildConflictScopeWhere,
  buildConflictWindowWhere,
  normalizeBufferMinutes,
} from "@/lib/bookings/booking-core";
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
import { assertStudioAcceptsBookings } from "@/lib/studio/accepts-bookings";
import { assertBelongsToStudio } from "@/lib/studio/tenancy";
import { resolveMoveItemDurationMin } from "@/lib/studio/move-duration";
import { planStudioMoveDuration } from "@/lib/studio/move-plan";
import { assertNoTimeBlockConflict } from "@/lib/schedule/time-blocks";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { scheduleBookingRemindersSafe } from "@/lib/bookings/reminders";

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
  // STUDIO-HIDDEN-MASTER-SERVICES: скрытая студия новых записей не принимает —
  // и ручных из кабинета тоже («по-другому никак»). Отказ действенный: причина
  // и что сделать. Существующие записи переносятся и отменяются как прежде.
  await assertStudioAcceptsBookings(
    studio.providerId,
    "Студия скрыта и не принимает записи. Включите видимость студии в настройках.",
  );

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
    created = await bookingTransaction(
      async (tx) => {
        // LOGIC-01: скоуп — из общего билдера. Пара `(providerId студии,
        // masterProviderId)` не видела брони ТОГО ЖЕ мастера, созданные через
        // его личный профиль (`providerId = мастер`), поэтому админ студии
        // создавал бронь поверх существующей БЕЗ всякой гонки — у этого пути
        // вдобавок нет предварительной availability-проверки, и in-tx предикат
        // был его единственной защитой.
        // LOGIC-17: окно обязательно. Без него запрос забирает всю историю
        // броней мастера и внутри Serializable ставит predicate-lock на неё
        // целиком — любая параллельная запись того же мастера, хоть на
        // следующий год, становилась кандидатом на P2034 и получала ложный
        // 409 SLOT_CONFLICT. Границы — из того же билдера, что у
        // `ensureNoConflicts`, иначе сужение запроса начнёт терять конфликты.
        const conflicts = await tx.booking.findMany({
          where: {
            ...buildConflictScopeWhere({
              providerId: studio.providerId,
              masterProviderId: master.id,
            }),
            status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
            ...buildConflictWindowWhere({
              startAtUtc: input.startAt,
              endAtUtc: endAt,
              bufferMin: buffer,
            }),
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

        const booking = await createBookingRow(tx, {
          data: {
            providerId: studio.providerId,
            // FIX-C1: `studioId` выводит writer из `providerId` — здесь это
            // `studio.providerId`, то есть тот же `studio.id`, что стоял раньше.
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
            // Администратор студии заносит запись, полученную вне сайта
            // (звонок / визит) — MANUAL здесь и есть правда.
            source: BookingSource.MANUAL,
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
      // FIX-C6: изоляцию ставит `bookingTransaction` (инв. #31).
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
}): Promise<StudioMoveResult> {
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

  // STUDIO-MOVE-GUARDS-01: переносить можно только живую запись и только в
  // будущее. Раньше перенос из журнала проходил и для отменённой/завершённой
  // записи, и на прошедшее время — такая «запись» появлялась в прошлом у
  // нового мастера и выпадала из всех списков.
  const runtimeBefore = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });
  if (runtimeBefore === "REJECTED" || runtimeBefore === "FINISHED" || runtimeBefore === "IN_PROGRESS") {
    throw new AppError(
      "Запись уже началась, завершена или отменена — перенести её нельзя.",
      409,
      "CONFLICT",
    );
  }
  if (input.targetStartAt.getTime() <= Date.now()) {
    throw new AppError("Нельзя перенести запись на прошедшее время.", 409, "CONFLICT");
  }

  // STUDIO-MOVE-DURATION-01: у другого мастера та же услуга может длиться иначе
  // (`MasterService.durationOverrideMin`). Диалог и перетаскивание в календаре
  // всегда шлют KEEP_SERVICE, и окно считалось по длительности ПРЕЖНЕГО
  // мастера: 60-минутная запись у мастера, которому нужно 90, оставляла хвост
  // незащищённым — туда можно было записать следующего клиента. При смене
  // мастера длительность берётся у нового мастера; цена — по `pricing`.
  // MOVE-PICKER-DURATION: расчёт вынесен в `planStudioMoveDuration` — его же
  // зовёт выдача окошек для переноса, иначе пикер предлагал время, которое
  // перенос затем отклонял.
  const plan = await planStudioMoveDuration({
    serviceItems: booking.serviceItems,
    currentMasterId: booking.masterProviderId,
    targetMasterId: input.targetMasterId,
    strategy: input.strategy,
  });
  const { masterChanged, durationStrategy, bookingServiceIds, overrideByServiceId } = plan;

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
  // `durationSnapshotMin` provably identical. (The map is built once in
  // `planStudioMoveDuration`, above.)

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
  const safeDuration = plan.windowMin;
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
    await bookingTransaction(
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
            // LOGIC-17: см. комментарий у create — без окна predicate-lock
            // накрывает всю историю броней целевого мастера.
            ...buildConflictWindowWhere({
              startAtUtc: newStart,
              endAtUtc: newEnd,
              bufferMin: buffer,
            }),
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

        // STUDIO-MOVE-GUARDS-01: администратор студии переносит напрямую (инв.
        // #22), то есть висящий запрос переноса этим решён. Прежде предложение
        // оставалось: календарь продолжал показывать «Принять», клиент — старое
        // предложение, а его принятие вернуло бы запись на предложенное время
        // уже у нового мастера без проверки рабочих часов.
        if (booking.status === "CHANGE_REQUESTED") {
          await applyBookingTransition(tx, {
            id: booking.id,
            expectedStatus: "CHANGE_REQUESTED",
            data: {
              status: "CONFIRMED",
              proposedStartAt: null,
              proposedEndAt: null,
              requestedBy: null,
              actionRequiredBy: null,
              changeComment: null,
            },
            select: { id: true },
          });
        }

        const timeChanged =
          previousStartAtUtc?.getTime() !== input.targetStartAt.getTime();
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            studioId: input.studioId,
            masterProviderId: input.targetMasterId,
            masterId: input.targetMasterId,
            startAtUtc: input.targetStartAt,
            endAtUtc: endAt,
            // STUDIO-MOVE-REMINDERS-01: напоминания привязаны к времени. Отметки
            // «отправлено» за прежнее время не должны гасить напоминание о
            // новом (клиент, перенёсшийся за час до визита на следующую неделю,
            // иначе не получал ни одного).
            ...(timeChanged ? { reminder24hSentAt: null, reminder2hSentAt: null } : {}),
          },
        });

        if (durationStrategy === "CHANGE_SERVICE" || input.pricing === "APPLY_TARGET") {
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
                  durationStrategy,
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
      // FIX-C6: изоляцию ставит `bookingTransaction` (инв. #31). Путь переноса
      // прежний сторож тоже не видел — повторная проверка здесь своя.
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

  // STUDIO-MOVE-REMINDERS-01: старые задачи отбросит сверка времени в
  // `processBookingReminder`; новые — по новому времени. Пост-коммитная обёртка.
  await scheduleBookingRemindersSafe(booking.id);

  return {
    id: booking.id,
    previousMasterProviderId: previousMasterProviderId ?? null,
    masterChanged,
    timeChanged: previousStartAtUtc?.getTime() !== input.targetStartAt.getTime(),
  };
}

export type StudioMoveResult = {
  id: string;
  previousMasterProviderId: string | null;
  masterChanged: boolean;
  timeChanged: boolean;
};

export async function updateMasterBookingStatus(input: {
  bookingId: string;
  masterId: string;
  status: "CONFIRMED" | "REJECTED" | "CANCELLED" | "NO_SHOW";
  comment?: string;
}): Promise<{
  id: string;
  status: string;
  unchanged?: true;
  /**
   * RESCHEDULE-DECLINE-NOTIFY-01: «Отклонить» на запросе переноса от клиента
   * отклоняет ПЕРЕНОС, а не запись (бронь остаётся на прежнем времени).
   * Вызывающему нужно это знать, чтобы не слать клиенту «Запись отклонена».
   */
  outcome?: "RESCHEDULE_DECLINED";
}> {
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
    return {
      id: confirmed.id,
      status: confirmed.status,
      ...(confirmed.unchanged ? { unchanged: true as const } : {}),
    };
  }

  if (runtimeStatus === "REJECTED") {
    throw new AppError("Запись уже завершена — изменить её нельзя.", 409, "VALIDATION_ERROR");
  }

  // LOGIC-05: «не пришёл» — единственное действие, для которого наступившее
  // время приёма не помеха, а ПРЕДПОСЫЛКА. Общий гейт отбивал его 409 ровно в
  // тот момент, когда оно только и имеет смысл, а до начала приёма — пропускал.
  // Мастер физически не мог отметить неявку: метрика неявок всегда нулевая,
  // политика поздних отмен опиралась на статус, который не проставляется.
  const isNoShowAction = input.status === "NO_SHOW";

  if (isNoShowAction) {
    if (runtimeStatus === "PENDING" || runtimeStatus === "CONFIRMED" || runtimeStatus === "CHANGE_REQUESTED") {
      throw new AppError("Приём ещё не начался — отметить неявку нельзя.", 409, "CONFLICT");
    }
  } else if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
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
    const declined = await declineClientRescheduleRequest(booking.id, "MASTER");
    return { ...declined, outcome: "RESCHEDULE_DECLINED" };
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
      // LOGIC-05: неявка — не отмена. `cancelledBy`/`cancelReason`/
      // `cancelledAtUtc` проставлялись безусловно, из-за чего `NO_SHOW` был
      // неотличим от «отменил мастер» в любом отчёте, который смотрит на эти
      // поля. Для неявки пишется только статус и служебные сбросы.
      data: isNoShowAction
        ? {
            status: input.status,
            requestedBy: "MASTER",
            actionRequiredBy: null,
            proposedStartAt: null,
            proposedEndAt: null,
            changeComment: comment || null,
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

  await invalidateSlotsForBookingRange({
    providerId: booking.providerId,
    masterProviderId: booking.masterProviderId ?? null,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  return { id: updated.id, status: updated.status };
}
