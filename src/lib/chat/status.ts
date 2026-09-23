import { BookingStatus } from "@prisma/client";

/**
 * Статусы, в которых клиент и мастер переписываются свободно.
 *
 * CHAT-BEFORE-CONFIRM-01 (решение владельца 2026-09-23): чат открыт и ДО
 * подтверждения записи мастером (`NEW`/`PENDING`), и пока согласуется перенос
 * (`CHANGE_REQUESTED`). Раньше открытыми были только подтверждённые статусы:
 * кнопка «Написать» у ожидающей записи вела в переписку с выключенным полем
 * ввода, а договориться о времени переноса было негде, кроме звонка. Именно
 * до подтверждения клиенту чаще всего есть что уточнить.
 */
export const OPEN_STATUSES: BookingStatus[] = [
  BookingStatus.NEW,
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHANGE_REQUESTED,
  BookingStatus.PREPAID,
  BookingStatus.STARTED,
  BookingStatus.IN_PROGRESS,
];

export const READONLY_WINDOW_HOURS = 24;

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isChatOpen(status: BookingStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * Статусы «ещё не подтверждена». Подтверждённую запись после визита воркер
 * переводит в `FINISHED` (BOOKING-FINALIZE-01), и чат закрывается окном в
 * сутки; неподтверждённую — не переводит никто. С CHAT-BEFORE-CONFIRM-01 это
 * значило бы чат, открытый вечно, по записи, время которой давно прошло.
 */
const AWAITING_STATUSES: BookingStatus[] = [
  BookingStatus.NEW,
  BookingStatus.PENDING,
  BookingStatus.CHANGE_REQUESTED,
];

/**
 * Можно ли писать в чат ЭТОЙ записи сейчас: статус открытый, и
 * неподтверждённая запись началась не больше суток назад (то же окно, что
 * `READONLY_WINDOW_HOURS` после завершённого визита). Единственное правило для
 * отправки, списка переписок и треда — `OPEN_STATUSES.includes` в обход него
 * снова откроет чат по брошенной заявке.
 */
export function isBookingChatOpen(
  booking: { status: BookingStatus; startAtUtc: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!isChatOpen(booking.status)) return false;
  if (!AWAITING_STATUSES.includes(booking.status)) return true;
  const startAt = toDate(booking.startAtUtc);
  if (!startAt) return true;
  return now.getTime() - startAt.getTime() <= READONLY_WINDOW_HOURS * 60 * 60 * 1000;
}

export function getChatAvailability(
  status: BookingStatus,
  startAtUtc: Date | string | null
): { canSend: boolean; isReadOnly: boolean; isAvailable: boolean } {
  const canSend = isBookingChatOpen({ status, startAtUtc });
  // Неподтверждённая запись, чьё окно прошло: переписка видна, писать нельзя.
  const staleAwaiting = !canSend && isChatOpen(status);
  const isFinished = status === BookingStatus.FINISHED;
  const startAt = isFinished ? toDate(startAtUtc) : null;
  let isReadOnly = false;

  if (!canSend && isFinished && startAt) {
    const diffMs = Date.now() - startAt.getTime();
    if (diffMs >= 0 && diffMs <= READONLY_WINDOW_HOURS * 60 * 60 * 1000) {
      isReadOnly = true;
    }
  }

  return {
    canSend,
    isReadOnly,
    isAvailable: canSend || isReadOnly || staleAwaiting || Boolean(isFinished && startAt),
  };
}
