import { AppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { resolveBookingDurationMin } from "@/lib/bookings/booking-duration";
import { requireProviderOwner } from "@/lib/auth/ownership";
import { prisma } from "@/lib/prisma";

/**
 * RESCHEDULE-SELF-SLOT (2026-09-15) — право исключить бронь из занятого времени
 * при выдаче окошек.
 *
 * Оба слот-роута (`/api/masters/[id]/availability`, `/api/public/providers/[id]/slots`)
 * принимают `?excludeBookingId=`: окно этой брони (и буфер вокруг) не считается
 * занятым, чтобы клиент, записанный на 10:00 с 90-минутной услугой, мог
 * перенестись на 10:30 при пустом дне. Запись переноса это и так допускает
 * (`ensureNoConflictsExcluding`, `confirmBooking` с `id: { not }`), не давал
 * только пикер.
 *
 * Параметр — не безобидный фильтр: исключённая бронь показывает своё окно как
 * свободное, то есть выдаёт время чужой записи по её id. Поэтому исключение
 * дают только сторонам брони: её клиенту либо владельцу кабинета / админу
 * студии (та же проверка, что у остальных provider-действий). Бронь обязана
 * принадлежать именно тому исполнителю, чьи окошки запрошены — иначе
 * исключение ничего не значит и молча искажало бы выдачу.
 *
 * MOVE-PICKER-DURATION (2026-09-23): вместе с id отдаётся длина САМОЙ записи
 * (`resolveBookingDurationMin` — то же правило, что у записи переноса). Окошки
 * для переноса обязаны считаться по ней, а не по текущей длительности услуги:
 * если длительность поменяли после записи или в записи несколько услуг, пикер
 * предлагал время, которое сервер затем отклонял, либо прятал допустимое.
 * Исполнитель здесь по построению тот же, что у записи, — то есть ровно тот
 * случай, где и перенос держит длину по снимку.
 */
export type RescheduleExclusion = {
  bookingId: string;
  /** Длина переносимой записи; `0` — вывести не из чего (роут берёт длительность услуги). */
  durationMin: number;
};

export async function resolveRescheduleExclusion(
  req: Request,
  performerProviderId: string,
  bookingIdRaw: string | null,
): Promise<RescheduleExclusion | undefined> {
  const bookingId = bookingIdRaw?.trim();
  if (!bookingId) return undefined;

  const user = await getSessionUser(req);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientUserId: true,
      providerId: true,
      masterProviderId: true,
      startAtUtc: true,
      endAtUtc: true,
      serviceItems: { select: { durationSnapshotMin: true } },
    },
  });
  const performsHere =
    booking !== null &&
    (booking.masterProviderId === performerProviderId ||
      (booking.masterProviderId === null && booking.providerId === performerProviderId));
  if (!booking || !performsHere) {
    throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");
  }

  const exclusion: RescheduleExclusion = {
    bookingId: booking.id,
    durationMin: resolveBookingDurationMin(booking),
  };
  if (booking.clientUserId === user.userId) return exclusion;

  // Сторона провайдера: владелец кабинета исполнителя либо админ студии, через
  // которую бронь оформлена. `requireProviderOwner` бросает 403 сам.
  try {
    await requireProviderOwner(user, performerProviderId);
    return exclusion;
  } catch (error) {
    if (booking.providerId !== performerProviderId) {
      await requireProviderOwner(user, booking.providerId);
      return exclusion;
    }
    throw error;
  }
}
