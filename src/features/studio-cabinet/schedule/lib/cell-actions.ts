import {
  resolveStudioBookingActions,
  type StudioBookingActions,
} from "@/lib/bookings/studio-actions";
import type { ScheduleBookingCell } from "../server/types";

/**
 * UX-PASS-01 — действия студии над ячейкой календаря / строкой журнала в
 * веб-кабинете. Меню записи раньше предлагало «Перенести» и «Отменить» и
 * отменённой, и завершённой записи (сервер отвечал отказом), а «Подтвердить» —
 * уже начавшейся. Правило одно с приложением и сервером —
 * `resolveStudioBookingActions`; здесь только перевод ISO-строк ячейки в даты
 * (тот же, что у `calendar-json.ts`).
 *
 * Клиент-безопасен: читает часы в момент вызова — вызывающий держит результат
 * в `useMemo` по записи, то есть время берётся на момент открытия меню.
 */
export function studioCellActions(
  cell: Pick<
    ScheduleBookingCell,
    | "status"
    | "startAtUtc"
    | "endAtUtc"
    | "actionRequiredBy"
    | "proposedStartAtUtc"
    | "proposedEndAtUtc"
    | "bookingPackageId"
  >,
  now?: Date,
): StudioBookingActions {
  return resolveStudioBookingActions({
    status: cell.status,
    startAtUtc: new Date(cell.startAtUtc),
    endAtUtc: new Date(cell.endAtUtc),
    actionRequiredBy: cell.actionRequiredBy,
    proposedStartAt: cell.proposedStartAtUtc ? new Date(cell.proposedStartAtUtc) : null,
    proposedEndAt: cell.proposedEndAtUtc ? new Date(cell.proposedEndAtUtc) : null,
    bookingPackageId: cell.bookingPackageId,
    now,
  });
}

/** Есть ли у студии хоть одно действие над записью — иначе меню не нужно. */
export function studioCellHasActions(actions: StudioBookingActions): boolean {
  return (
    actions.confirm ||
    actions.acceptReschedule ||
    actions.declineReschedule ||
    actions.move ||
    actions.cancel
  );
}
