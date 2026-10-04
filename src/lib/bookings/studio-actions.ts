import type { BookingStatus } from "@prisma/client";
import { resolveBookingRuntimeStatus, type BookingRuntimeStatus } from "@/lib/bookings/flow";

/**
 * MOBILE-STUDIO-C (ops) — какие действия владелец/администратор студии может
 * совершить над записью студии ПРЯМО СЕЙЧАС. Одно правило на все списки
 * кабинета студии в приложении (главная, календарь, журнал) и карточку записи —
 * по образцу `master-actions.ts`.
 *
 * Флаги повторяют проверки сервера для стороны студии (актор MASTER /
 * cancelledBy PROVIDER: `requireBookingConfirmAccess` /
 * `requireBookingCancelAccess` пускают администратора студии записи):
 *  - подтверждение — `confirmBooking` (`POST /api/bookings/{id}/confirm`):
 *    PENDING со временем; при CHANGE_REQUESTED — только если ответа ждут от
 *    стороны мастера, применяет предложенное время, а прошедшее предложение
 *    сервер отклоняет;
 *  - отказ от переноса — `declineClientRescheduleRequest`
 *    (`POST /api/bookings/{id}/decline-reschedule`): CHANGE_REQUESTED, ответ за
 *    стороной мастера;
 *  - отмена — `cancelBooking` (`POST /api/bookings/{id}/cancel`): у стороны
 *    исполнителя нет окна 60 минут и дедлайна, только «ещё не началась»;
 *    запись пакета — только пакетом (`POST /api/bookings/package/{id}/cancel`,
 *    причина обязательна);
 *  - перенос — `moveStudioBooking` (`PATCH /api/studio/bookings/{id}/move`):
 *    не началась, не завершена и не отменена.
 *
 * Неявки, чата и «предложить клиенту другое время» у студии нет: эти маршруты
 * администратора студии не пускают (или веб-кабинет студии их не использует).
 *
 * Клиент-безопасен (только типы Prisma).
 */

export type StudioBookingActions = {
  /** `POST /api/bookings/{id}/confirm` — подтвердить неподтверждённую запись. */
  confirm: boolean;
  /** `POST /api/bookings/{id}/confirm` — принять время, которое предложил клиент. */
  acceptReschedule: boolean;
  /** `POST /api/bookings/{id}/decline-reschedule` — отказать в переносе: запись остаётся на прежнем времени. */
  declineReschedule: boolean;
  /** Клиенту предложено новое время, ждём его ответа: отвечать нечего. */
  awaitingClient: boolean;
  /** `PATCH /api/studio/bookings/{id}/move` — перенести на другое время и/или к другому мастеру. */
  move: boolean;
  /** Отменить: `POST /api/bookings/{id}/cancel` или пакетом (см. `wholePackageOnly`). */
  cancel: boolean;
  /**
   * Запись — часть пакета: отмена только пакетом целиком,
   * `POST /api/bookings/package/{bookingPackageId}/cancel {reason}` (причина обязательна).
   */
  wholePackageOnly: boolean;
};

export type StudioBookingActionInput = {
  status: BookingStatus;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  proposedStartAt: Date | null;
  proposedEndAt: Date | null;
  bookingPackageId: string | null;
  now?: Date;
};

const OPEN_STATUSES: ReadonlySet<BookingRuntimeStatus> = new Set(["PENDING", "CONFIRMED", "CHANGE_REQUESTED"]);

function isValidDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function resolveStudioBookingActions(input: StudioBookingActionInput): StudioBookingActions {
  const now = input.now ?? new Date();
  const runtime = resolveBookingRuntimeStatus({
    status: input.status,
    startAtUtc: input.startAtUtc,
    endAtUtc: input.endAtUtc,
    now,
  });
  const isOpen = OPEN_STATUSES.has(runtime);
  const isChangeRequest = runtime === "CHANGE_REQUESTED";
  const studioTurn = isChangeRequest && input.actionRequiredBy === "MASTER";
  const proposalUsable =
    isValidDate(input.proposedStartAt) &&
    isValidDate(input.proposedEndAt) &&
    input.proposedStartAt.getTime() > now.getTime();

  return {
    confirm: runtime === "PENDING" && isValidDate(input.startAtUtc) && isValidDate(input.endAtUtc),
    acceptReschedule: studioTurn && proposalUsable,
    declineReschedule: studioTurn,
    awaitingClient: isChangeRequest && input.actionRequiredBy === "CLIENT",
    move: isOpen,
    cancel: isOpen,
    wholePackageOnly: input.bookingPackageId !== null,
  };
}

/** Студия должна ответить: подтвердить запись или решить по переносу. */
export function studioBookingNeedsAnswer(actions: StudioBookingActions): boolean {
  return actions.confirm || actions.acceptReschedule || actions.declineReschedule;
}
