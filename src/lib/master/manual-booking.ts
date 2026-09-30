import { BookingSource } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { ensureNoConflicts, normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { createBookingRow } from "@/lib/bookings/booking-row";
import { clearOperatorTime } from "@/lib/bookings/booking-time-policy";
import { bookingTransaction } from "@/lib/bookings/booking-transaction";
import { mapPrismaBookingConflict } from "@/lib/bookings/prisma-conflict";
import { scheduleBookingRemindersSafe } from "@/lib/bookings/reminders";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { prisma } from "@/lib/prisma";

/**
 * Ручная запись мастера на СВОЮ услугу (кабинет мастера, «Новая запись»).
 * Жила в `day.service.ts` рядом с экраном дня `/api/master/day`, который
 * интерфейс не использовал и удалён (STUDIO-MASTER-SPLIT-01).
 */
export async function createSoloMasterBooking(input: {
  masterId: string;
  serviceId: string;
  startAt: Date;
  clientName: string;
  clientPhone?: string;
  notes?: string;
}): Promise<{ id: string }> {
  const master = await prisma.provider.findUnique({
    where: { id: input.masterId },
    select: { id: true, studioId: true, type: true, bufferBetweenBookingsMin: true },
  });
  if (!master || master.type !== "MASTER") {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }
  // STUDIO-MASTER-OWN-BOOKINGS-01: ручная запись — на СОБСТВЕННЫЕ услуги
  // мастера (выборка ниже ограничена `providerId: masterId`), поэтому мастеру
  // студии она доступна так же; студийные услуги вручную записывает студия.

  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      providerId: input.masterId,
      isEnabled: true,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      title: true,
      durationMin: true,
      price: true,
    },
  });
  if (!service) {
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
  }

  const endAt = new Date(input.startAt.getTime() + service.durationMin * 60000);

  // FIX-R2-01-A: close the manual-booking double-book hole. R2-01 found this
  // path created a booking with NO overlap check — a master could silently
  // double-book their own slot (every other path — client funnel, reschedule,
  // studio — checks). Mirror the create funnel (`createBooking`): the shared,
  // buffer-aware `ensureNoConflicts` runs BOTH pre-transaction (fast-fail) and
  // INSIDE a Serializable transaction (no TOCTOU). On overlap → 409
  // SLOT_CONFLICT, consistent with every other booking path. Scope matches how
  // solo-master bookings are stored (providerId === masterProviderId === masterId).
  // The intentional operator relaxations stay — min-hours, work-hours/off-schedule
  // and walk-in (no registered client) are NOT enforced here, only the silent
  // overlap is closed.
  const conflictScope = {
    providerId: input.masterId,
    masterProviderId: input.masterId,
    startAtUtc: input.startAt,
    endAtUtc: endAt,
    bufferMin: normalizeBufferMinutes(master.bufferBetweenBookingsMin),
  };
  await ensureNoConflicts(prisma, conflictScope);

  const created = await bookingTransaction(
    async (tx) => {
      await ensureNoConflicts(tx, conflictScope);

      const booking = await createBookingRow(tx, {
        // 29.09 доработки · 07: ручная запись мастера — без окна для клиентов,
        // прошедшее время допустимо (решение владельца: занести прошедший визит).
        timePolicy: clearOperatorTime(input.startAt),
        data: {
          // Путь доступен ТОЛЬКО мастеру без студии (403 выше), поэтому writer
          // выведет `studioId: null` — и это тот же ответ, что был здесь всегда.
          providerId: input.masterId,
          masterProviderId: input.masterId,
          masterId: input.masterId,
          serviceId: service.id,
          startAtUtc: input.startAt,
          endAtUtc: endAt,
          slotLabel: input.startAt.toISOString(),
          clientName: input.clientName.trim(),
          clientPhone: input.clientPhone?.trim() || "",
          notes: input.notes?.trim() || null,
          // Мастер заносит уже известную запись руками — MANUAL здесь правда.
          source: BookingSource.MANUAL,
          // MANUAL-BOOKING-CONFIRMED-01: мастер сам заносит известную ему запись —
          // подтверждать её самому себе бессмысленно, а неподтверждённая она
          // выпадала из жизненного цикла целиком: ни напоминаний (они только для
          // подтверждённых — мастеру тоже), ни `FINISHED` после визита
          // (BOOKING-FINALIZE-01 не объявляет визитом неподтверждённое), то есть
          // ручные клиенты не попадали в CRM, «визиты» и выручку.
          status: "CONFIRMED",
          // R2-01-D: a solo master entering a manual booking is recording a known
          // appointment — flagging the master to "action" their own booking is a
          // redundant self-action (it nagged in the dashboard attention panel). Drop
          // the self-flag. Kept PENDING (lowest-risk: no lifecycle / notification
          // change); the master can still confirm it from the kanban — PENDING →
          // CONFIRMED does not gate on actionRequiredBy (confirmBooking.ts checks it
          // only for CHANGE_REQUESTED). The studio manual path (admin creates → a
          // different master confirms) is a legitimate two-party flow, left as-is.
          actionRequiredBy: null,
        },
        select: { id: true },
      });

      await tx.bookingServiceItem.create({
        data: {
          bookingId: booking.id,
          serviceId: service.id,
          titleSnapshot: service.title?.trim() || service.name,
          priceSnapshot: service.price,
          durationSnapshotMin: service.durationMin,
        },
      });

      return booking;
    },
    // FIX-C6: изоляцию ставит `bookingTransaction` (инв. #31).
  ).catch((error: unknown) => {
    // Гонка на коммите — «время занято», а не 500.
    throw mapPrismaBookingConflict(error) ?? error;
  });

  await invalidateSlotsForBookingRange({
    providerId: input.masterId,
    masterProviderId: input.masterId,
    startAtUtc: input.startAt,
    endAtUtc: endAt,
  });
  await invalidateAdvisorCache(input.masterId);
  // MANUAL-BOOKING-CONFIRMED-01: пост-коммитная обёртка (сбой очереди не даёт
  // 500 на уже созданную запись, RES-03).
  await scheduleBookingRemindersSafe(created.id);

  return { id: created.id };
}
