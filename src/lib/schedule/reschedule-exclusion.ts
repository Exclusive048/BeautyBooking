import { AppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
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
 */
export async function resolveRescheduleExclusion(
  req: Request,
  performerProviderId: string,
  bookingIdRaw: string | null,
): Promise<string | undefined> {
  const bookingId = bookingIdRaw?.trim();
  if (!bookingId) return undefined;

  const user = await getSessionUser(req);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, clientUserId: true, providerId: true, masterProviderId: true },
  });
  const performsHere =
    booking !== null &&
    (booking.masterProviderId === performerProviderId ||
      (booking.masterProviderId === null && booking.providerId === performerProviderId));
  if (!booking || !performsHere) {
    throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");
  }

  if (booking.clientUserId === user.userId) return booking.id;

  // Сторона провайдера: владелец кабинета исполнителя либо админ студии, через
  // которую бронь оформлена. `requireProviderOwner` бросает 403 сам.
  try {
    await requireProviderOwner(user, performerProviderId);
    return booking.id;
  } catch (error) {
    if (booking.providerId !== performerProviderId) {
      await requireProviderOwner(user, booking.providerId);
      return booking.id;
    }
    throw error;
  }
}
