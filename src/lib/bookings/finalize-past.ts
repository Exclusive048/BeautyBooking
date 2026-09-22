import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { BOOKING_FINISH_GRACE_MINUTES } from "@/lib/bookings/flow";
import { applyBookingTransition } from "@/lib/bookings/transition";

/**
 * BOOKING-FINALIZE-01 — подтверждённый визит после окончания становится
 * `FINISHED` в БД, а не только «в уме».
 *
 * 🔴 Дефект: `FINISHED` существовал только как вычисляемый статус
 * (`resolveBookingRuntimeStatus`: начало + длительность + 60 минут), а в БД его
 * не писал никто — ни кнопки, ни задачи. Между тем по `status: FINISHED`
 * фильтруют больше двадцати мест: визиты, LTV и «последний визит» в CRM
 * мастера и студии, счётчик визитов в избранном и профиле клиента, «недавние
 * мастера», недельная статистика мастера, «завершено сегодня» в студии, окно
 * чата после визита, счётчик на странице входа. В проде всё это показывало
 * нули; на сидах — нет, потому что сид пишет `FINISHED` напрямую.
 *
 * Переводятся только ПОДТВЕРЖДЁННЫЕ статусы (тот же набор, что аналитика
 * считает подтверждённым, `STATUS_CONFIRMED`): неподтверждённую (`PENDING`) или
 * зависшую в переносе запись фактом визита объявлять нельзя. Момент — тот же,
 * что у вычисляемого статуса, поэтому экраны не меняют показания: запись и так
 * уже выглядела завершённой. Запись идёт единственным примитивом переходов
 * (`applyBookingTransition`, LOGIC-02): если за это время статус изменил
 * человек (отметил неявку), побеждает он, а проход пропускает строку.
 */
const FINALIZABLE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PREPAID,
  BookingStatus.STARTED,
  BookingStatus.IN_PROGRESS,
];
const BATCH_SIZE = 200;

export async function finalizePastBookings(
  now: Date = new Date(),
): Promise<{ candidates: number; finished: number }> {
  const cutoff = new Date(now.getTime() - BOOKING_FINISH_GRACE_MINUTES * 60 * 1000);
  const candidates = await prisma.booking.findMany({
    where: { status: { in: FINALIZABLE_STATUSES }, endAtUtc: { lte: cutoff } },
    select: { id: true, status: true },
    orderBy: { endAtUtc: "asc" },
    take: BATCH_SIZE,
  });

  let finished = 0;
  for (const booking of candidates) {
    try {
      await applyBookingTransition(prisma, {
        id: booking.id,
        expectedStatus: booking.status,
        data: { status: BookingStatus.FINISHED },
        select: { id: true },
      });
      finished += 1;
    } catch (error) {
      // Статус успели изменить между чтением и записью — это решение человека.
      if (error instanceof AppError && error.code === "BOOKING_STATUS_CHANGED") continue;
      throw error;
    }
  }
  return { candidates: candidates.length, finished };
}
