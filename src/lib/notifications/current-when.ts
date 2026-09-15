import { formatBookingWhenLabel } from "@/lib/notifications/format-booking-when";

/**
 * RESCHEDULE-CURRENT-TIME (2026-09-15) — строка «Актуальное время» у уведомления
 * о записи.
 *
 * Текст уведомления заморожен в момент события, а бронь живёт дальше: клиент
 * оформил запись и тут же попросил перенос — мастер читал первую дату как
 * актуальную. `center.ts` (`mergeBookingPayload`) подмешивает в payload живое
 * время (`currentStartAtUtc` = предложение переноса, если оно есть, иначе
 * текущее начало) и зону салона; здесь решается, ПОКАЗЫВАТЬ ли его: только
 * когда оно разошлось с сохранённым `startAtUtc` и бронь ещё жива.
 *
 * Одна функция на ТРИ поверхности — общий центр `/notifications`, кабинет
 * мастера `/cabinet/master/notifications`, кабинет студии — иначе первая
 * версия правки закрыла только центр, а мастер (у которого своя страница)
 * по-прежнему видел первую дату. Время — salon-tz с меткой (rule 17).
 */
export type CurrentWhenPayload = {
  startAtUtc?: string | null;
  currentStartAtUtc?: string | null;
  providerTimezone?: string | null;
  bookingStatus?: string | null;
};

const CURRENT_TIME_IRRELEVANT_STATUSES = new Set(["CANCELLED", "REJECTED", "NO_SHOW"]);

export function resolveCurrentWhenLabel(
  payload: CurrentWhenPayload | null | undefined,
): string | null {
  if (!payload?.currentStartAtUtc || !payload.startAtUtc || !payload.providerTimezone) return null;
  const saved = Date.parse(payload.startAtUtc);
  const current = Date.parse(payload.currentStartAtUtc);
  if (Number.isNaN(saved) || Number.isNaN(current) || saved === current) return null;
  if (
    payload.bookingStatus &&
    CURRENT_TIME_IRRELEVANT_STATUSES.has(payload.bookingStatus.toUpperCase())
  ) {
    return null;
  }
  return formatBookingWhenLabel(new Date(current), payload.providerTimezone);
}
