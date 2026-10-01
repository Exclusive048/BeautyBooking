import { BookingStatus, type Prisma } from "@prisma/client";
import { BOOKING_FINISH_GRACE_MINUTES, normalizeBookingStatus } from "@/lib/bookings/flow";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";

/**
 * DELETION-03 — «есть активные записи» считается ОДНИМ предикатом во всех трёх
 * процедурах удаления (кабинет мастера, кабинет студии, аккаунт целиком).
 *
 * Раньше каждая держала свой литеральный список `NEW/PENDING/CONFIRMED/IN_PROGRESS`,
 * и в нём не было `CHANGE_REQUESTED`, `PREPAID`, `STARTED`: запись, перенос
 * которой ещё согласуется, удаление не останавливала, и клиент ни о чём не
 * узнавал. Список теперь ВЫВОДИТСЯ из канонической нормализации
 * (`normalizeBookingStatus`): живо всё, что не свелось к REJECTED/FINISHED, —
 * новый статус попадёт сюда сам.
 *
 * Второе измерение — время. Бронь, визит по которой прошёл (с тем же
 * запасом, после которого `resolveBookingRuntimeStatus` считает её FINISHED),
 * удаление не блокирует: иначе забытая неподтверждённая заявка из прошлого
 * запирала кабинет навсегда, а закрыть её было уже нечем.
 */
export const DELETION_BLOCKING_STATUSES: BookingStatus[] = (Object.values(BookingStatus) as BookingStatus[]).filter(
  (status) => {
    const runtime = normalizeBookingStatus(status);
    return runtime !== "REJECTED" && runtime !== "FINISHED";
  },
);

export function blockingBookingWhere(now: Date = new Date()): Prisma.BookingWhereInput {
  const finishedBefore = new Date(now.getTime() - BOOKING_FINISH_GRACE_MINUTES * 60_000);
  return {
    status: { in: DELETION_BLOCKING_STATUSES },
    OR: [{ endAtUtc: { gt: finishedBefore } }, { proposedEndAt: { gt: now } }],
  };
}

type BookingCounter = { booking: { count: (args: { where: Prisma.BookingWhereInput }) => Promise<number> } };

/** Живые записи кабинета мастера: он провайдер ИЛИ исполнитель (в т.ч. в студии). */
export function countBlockingMasterBookings(db: BookingCounter, providerId: string, now?: Date): Promise<number> {
  return db.booking.count({
    where: {
      AND: [blockingBookingWhere(now), { OR: [{ providerId }, { masterProviderId: providerId }] }],
    },
  });
}

/**
 * Живые записи студии — ровно те, что видит журнал студии (`studioId`,
 * `studioBookingsWhere`). Записи мастеров команды с их ЛИЧНЫХ страниц сюда не
 * входят: студия их не видит и закрыть не может, а удаление студии их не
 * затрагивает (мастер остаётся со своим кабинетом).
 */
export function countBlockingStudioBookings(
  db: BookingCounter,
  studio: { id: string },
  now?: Date,
): Promise<number> {
  return db.booking.count({
    where: {
      AND: [blockingBookingWhere(now), studioBookingsWhere(studio.id)],
    },
  });
}

/**
 * 29.09 доработки · 26 (решение владельца 26.1) — предстоящие записи КЛИЕНТА.
 * Тот же предикат, что у кабинетов: живой статус и визит ещё не прошёл.
 * Удаление аккаунта с такой записью останавливается — иначе запись оставалась
 * подтверждённой, мастер ждал человека, которого нет, а напоминания уходили в
 * центр уведомлений удалённого профиля.
 */
export function countBlockingClientBookings(db: BookingCounter, userId: string, now?: Date): Promise<number> {
  return db.booking.count({
    where: { AND: [blockingBookingWhere(now), { clientUserId: userId }] },
  });
}
