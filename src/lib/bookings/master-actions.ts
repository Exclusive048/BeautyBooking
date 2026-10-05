import type { BookingStatus } from "@prisma/client";
import {
  BOOKING_ACTION_WINDOW_MINUTES,
  BOOKING_CHANGE_REQUEST_LIMIT,
  canMarkNoShow,
  minutesUntilStart,
  resolveBookingRuntimeStatus,
  type BookingRuntimeStatus,
} from "@/lib/bookings/flow";

/**
 * MOBILE-MASTER-C — какие действия мастер может совершить над записью ПРЯМО
 * СЕЙЧАС. Одно правило на все списки кабинета в приложении (дашборд, канбан,
 * неделя) и карточку записи: раньше эти условия жили только в клиентских
 * компонентах веба (`booking-card-actions`, `booking-manage-actions`,
 * `booking-row-actions`), а приложению пришлось бы повторять их и расходиться.
 *
 * Флаги повторяют проверки сервера, а не придумывают свои:
 *  - подтверждение — `confirmBooking` (PENDING; перенос — только той стороной,
 *    от которой ждут ответа);
 *  - отказ / отмена / неявка — `updateMasterBookingStatus` (`PATCH
 *    /api/master/bookings/{id}/status`): окно 60 минут (`ensureBookingActionWindow`),
 *    отказ от переноса клиента без окна и без причины, неявка — `canMarkNoShow`;
 *  - перенос — `rescheduleBooking` (`POST /api/bookings/{id}/reschedule`):
 *    PENDING/CONFIRMED, окно 60 минут, не больше `BOOKING_CHANGE_REQUEST_LIMIT`
 *    переносов от мастера.
 *
 * «Завершить» действия нет: FINISHED — вычисляемый статус (конец приёма + 60 мин,
 * `resolveBookingRuntimeStatus`), сервер его не принимает.
 *
 * Клиент-безопасен (только типы Prisma).
 */

export type MasterBookingActions = {
  /** `PATCH …/status {status:"CONFIRMED"}` — подтвердить запись или принять перенос, о котором просит клиент. */
  confirm: boolean;
  /** `PATCH …/status {status:"REJECTED", comment}` — отклонить неподтверждённую запись (причина обязательна). */
  decline: boolean;
  /** `PATCH …/status {status:"REJECTED"}` без причины — отказать в переносе: запись остаётся на прежнем времени. */
  declineReschedule: boolean;
  /** `PATCH …/status {status:"CANCELLED", comment}` — отменить подтверждённую запись (причина обязательна). */
  cancel: boolean;
  /** `POST /api/bookings/{id}/reschedule` — предложить клиенту другое время. */
  reschedule: boolean;
  /** `PATCH …/status {status:"NO_SHOW"}` — клиент не пришёл (приём идёт или закончился меньше часа назад). */
  noShow: boolean;
  /** Мастер сам предложил перенос и ждёт ответа клиента: отвечать нечего. */
  awaitingClient: boolean;
  /** До начала меньше 60 минут: отказ, отмена и перенос закрыты (показать выключенными с пояснением). */
  modifyWindowClosed: boolean;
  /**
   * Запись — часть пакета: отказ и отмена — только пакетом целиком,
   * `POST /api/bookings/package/{bookingPackageId}/cancel {reason}`.
   */
  wholePackageOnly: boolean;
  /** Лимит переносов от мастера исчерпан — перенос закрыт. */
  rescheduleLimitReached: boolean;
};

export type MasterBookingActionInput = {
  status: BookingStatus;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  requestedBy: "CLIENT" | "MASTER" | null;
  bookingPackageId: string | null;
  masterChangeRequestsCount: number;
  now?: Date;
};

const OPEN_STATUSES: ReadonlySet<BookingRuntimeStatus> = new Set(["PENDING", "CONFIRMED", "CHANGE_REQUESTED"]);

export function resolveMasterBookingActions(input: MasterBookingActionInput): MasterBookingActions {
  const now = input.now ?? new Date();
  const runtime = resolveBookingRuntimeStatus({
    status: input.status,
    startAtUtc: input.startAtUtc,
    endAtUtc: input.endAtUtc,
    now,
  });
  const isOpen = OPEN_STATUSES.has(runtime);
  const minutesLeft = minutesUntilStart(input.startAtUtc, now);
  // Без времени начала сервер отказывает в отмене и переносе (`BOOKING_TIME_REQUIRED`).
  const windowOpen = minutesLeft !== null && minutesLeft >= BOOKING_ACTION_WINDOW_MINUTES;
  const isChangeRequest = runtime === "CHANGE_REQUESTED";
  const clientAsksReschedule =
    isChangeRequest && input.actionRequiredBy === "MASTER" && input.requestedBy === "CLIENT";
  const rescheduleLimitReached = input.masterChangeRequestsCount >= BOOKING_CHANGE_REQUEST_LIMIT;

  return {
    confirm: runtime === "PENDING" || (isChangeRequest && input.actionRequiredBy === "MASTER"),
    decline: runtime === "PENDING" && windowOpen,
    declineReschedule: clientAsksReschedule,
    cancel: (runtime === "CONFIRMED" || isChangeRequest) && windowOpen,
    reschedule: (runtime === "PENDING" || runtime === "CONFIRMED") && windowOpen && !rescheduleLimitReached,
    noShow: canMarkNoShow({
      status: input.status,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      now,
    }),
    awaitingClient: isChangeRequest && input.actionRequiredBy === "CLIENT",
    modifyWindowClosed: isOpen && !windowOpen,
    wholePackageOnly: input.bookingPackageId !== null,
    rescheduleLimitReached,
  };
}

/**
 * «Ждёт ответа мастера» — то же множество, что бейдж «Записи» кабинета
 * (`getPendingBookingsCountForMaster`), но по вычисляемому статусу: начавшаяся
 * запись ответа уже не ждёт.
 */
export function bookingNeedsMasterAnswer(input: {
  status: BookingStatus;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  now?: Date;
}): boolean {
  if (input.actionRequiredBy !== "MASTER") return false;
  const runtime = resolveBookingRuntimeStatus(input);
  return runtime === "PENDING" || runtime === "CHANGE_REQUESTED";
}
