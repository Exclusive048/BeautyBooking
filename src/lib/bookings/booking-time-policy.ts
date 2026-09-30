import { AppError } from "@/lib/api/errors";
import {
  assertAcceptsNewClient,
  assertBookingWindow,
  assertNotInPast,
  assertWithinMaxDaysAhead,
  type ProviderPolicy,
} from "@/lib/bookings/policy-enforcement";

/**
 * 29.09 доработки · 07 — разрешение на время записи.
 *
 * `createBookingRow` (единственный writer строки `Booking`, инв. #45) требует
 * `BookingTimeClearance`: объект с брендом, который выдают ТОЛЬКО функции этого
 * модуля, и каждая из них сначала проверяет свою строку политики (таблица — в
 * шапке `policy-enforcement.ts`). Новый путь создания без выбранной политики
 * времени не компилируется, а самодельный литерал не проходит по типу
 * (GUARD-INTEGRITY правило 8: тип вместо сторожа).
 *
 * Переносы (`update`) типом не покрываются — там явные вызовы проверок.
 */

declare const timeClearanceBrand: unique symbol;

export type BookingTimeKind = "client-window" | "studio-admin" | "operator" | "offer";

export type BookingTimeClearance = {
  readonly startAtUtc: Date;
  readonly kind: BookingTimeKind;
  readonly [timeClearanceBrand]: true;
};

function issue(startAtUtc: Date, kind: BookingTimeKind): BookingTimeClearance {
  return { startAtUtc, kind } as BookingTimeClearance;
}

/**
 * Клиент выбирает время (воронка, пакеты): окно записи и «новые клиенты».
 * Проверки делает вызывающий `resolveBookingCore` — эта функция выдаёт
 * разрешение ПОСЛЕ них, в том же месте, поэтому принимает уже проверенное.
 */
export function clearClientWindow(input: {
  startAtUtc: Date;
  window: Pick<ProviderPolicy, "minBookingHoursAhead" | "maxBookingDaysAhead">;
  acceptNewClients: Pick<ProviderPolicy, "acceptNewClients">;
  priorBookingsCount: number | null;
  now: Date;
}): BookingTimeClearance {
  assertBookingWindow(input.startAtUtc, input.window, input.now);
  if (!input.acceptNewClients.acceptNewClients) {
    assertAcceptsNewClient(input.acceptNewClients, input.priorBookingsCount ?? 0);
  }
  return issue(input.startAtUtc, "client-window");
}

/**
 * «Новая запись» администратора студии (решение владельца 2026-09-29):
 * «максимум вперёд» и «новые клиенты» — строже из студии и мастера; «минимум
 * за» — нет (звонок «через час» записать можно); прошлое время — можно.
 */
export function clearStudioAdminTime(input: {
  startAtUtc: Date;
  window: Pick<ProviderPolicy, "maxBookingDaysAhead">;
  acceptNewClients: Pick<ProviderPolicy, "acceptNewClients">;
  priorBookingsCount: number;
  now: Date;
}): BookingTimeClearance {
  assertWithinMaxDaysAhead(input.startAtUtc, input.window, input.now);
  assertAcceptsNewClient(input.acceptNewClients, input.priorBookingsCount);
  return issue(input.startAtUtc, "studio-admin");
}

/**
 * Ручная запись мастера: время — его, правила для клиентов к нему не
 * относятся; прошедшее время допустимо (решение владельца 2026-09-29).
 */
export function clearOperatorTime(startAtUtc: Date): BookingTimeClearance {
  return issue(startAtUtc, "operator");
}

/**
 * Подтверждение модель-оффера: время назначил мастер — окна нет, но «не в
 * прошлом» (решение владельца 2026-09-29).
 */
export function clearOfferTime(startAtUtc: Date, now: Date): BookingTimeClearance {
  assertNotInPast(
    startAtUtc,
    now,
    "Время этого предложения уже прошло. Попросите мастера предложить новое.",
  );
  return issue(startAtUtc, "offer");
}

/** Writer сверяет разрешение с записываемым временем: расхождение — ошибка программиста. */
export function assertClearanceMatches(clearance: BookingTimeClearance, startAtUtc: Date | string): void {
  const start = startAtUtc instanceof Date ? startAtUtc : new Date(startAtUtc);
  if (clearance.startAtUtc.getTime() !== start.getTime()) {
    throw new AppError("Не удалось создать запись. Попробуйте ещё раз.", 500, "INTERNAL_ERROR", {
      reason: "TIME_CLEARANCE_MISMATCH",
    });
  }
}
