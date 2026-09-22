import { logError } from "@/lib/logging/logger";
import {
  loadBookingWithRelations,
  notifyBookingConfirmed,
  notifyBookingCreated,
} from "@/lib/notifications/booking-notifications";

/**
 * PACKAGE-NOTIFY-01 — пакетная запись уведомляет так же, как одиночная, но
 * ОДИН раз на пакет (по первой услуге), а не N раз на компоненты.
 *
 * Раньше пакет не уведомлял никого: ни мастера, которому его ещё надо
 * подтвердить (пакет рождается PENDING, пока нет автоподтверждения), ни
 * администраторов студии, ни клиента при автоподтверждении. Вызывать строго
 * после коммита и только для НОВОГО пакета — повтор по ключу идемпотентности
 * возвращается раньше и сюда не доходит. Сбой рассылки пакет не откатывает.
 */
export async function notifyPackageBookingCreated(input: {
  bookingIds: string[];
  autoConfirmed: boolean;
}): Promise<void> {
  const firstId = input.bookingIds[0];
  if (!firstId) return;
  try {
    const booking = await loadBookingWithRelations(firstId);
    if (!booking) return;
    await notifyBookingCreated(booking);
    if (input.autoConfirmed) await notifyBookingConfirmed(booking);
  } catch (error) {
    logError("package booking notification failed", {
      bookingId: firstId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
