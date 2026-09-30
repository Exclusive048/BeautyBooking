import type { AvailabilitySlot } from "@/lib/domain/schedule";
import {
  listAvailabilitySlotsPaginated,
  type AvailabilitySlotsPageMeta,
} from "@/lib/schedule/usecases";
import {
  earliestBookableUtc,
  latestBookableUtc,
  type ProviderPolicy,
} from "@/lib/bookings/policy-enforcement";

/**
 * EXP-025 / EXP-026 — single source of truth for the bookable-slot window.
 *
 * The defect this closes: the public `/api/public/providers/[id]/slots`
 * endpoint enforced `minBookingHoursAhead` (dropping slots before
 * `now + minBookingHoursAhead`) and applied the effective weekly /
 * override schedule filter, but the parallel
 * `/api/masters/[id]/availability` endpoint (studio booking wizard +
 * reschedule modals) re-implemented only the schedule filter and
 * **skipped the min-ahead cutoff** — so it offered too-soon slots the
 * server's `assertBookingWindow` would then reject at submit. The two
 * endpoints also disagreed on `to` inclusivity (EXP-026).
 *
 * Rather than copy-paste the enforcement (which is exactly how it
 * drifted), both endpoints now call this one helper for the
 * window/schedule filtering. A slot this helper returns is a slot the
 * booking-window guard will accept. The only thing `/slots` adds on top
 * is its catalog-visibility horizon clamp (`visibleSlotDays`) + hot-slot
 * pricing decoration — those stay route-local because `/availability`
 * (authenticated reschedule) is bounded by `maxBookingDaysAhead`, not the
 * public catalog-visibility horizon, so force-clamping it would wrongly
 * block rescheduling beyond `visibleSlotDays`.
 *
 * The proven slot ENGINE (`listAvailabilitySlotsPaginated` →
 * `buildSlotsForDay`) is untouched — this helper only filters its output.
 *
 * SCHEDULE-PATTERNS-01 (этап 1): рабочие дни и режим «Фиксированное время»
 * здесь больше НЕ проверяются. Этот helper держал собственную копию правил
 * недели и исключений, и режим фиксированного времени знала только она — ядро
 * записи, горящие окошки, «свободно сегодня» и фильтр каталога «когда» его не
 * видели. Теперь режим — часть `DayPlan` движка, и окошки приходят уже
 * отфильтрованными; здесь остаётся только окно записи.
 */

export type BookableWindowProvider = {
  id: string;
  timezone: string;
  minBookingHoursAhead: number;
};

export type BookableSlotsResult =
  | { ok: true; slots: AvailabilitySlot[]; meta: AvailabilitySlotsPageMeta }
  | { ok: false; status: number; code?: string; message: string };

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns the bookable slots for a provider/service within a date range:
 * the schedule engine output (working days and FIXED-mode starts are already
 * applied by the engine), filtered by the booking window — the
 * `minBookingHoursAhead` cutoff and, for a foreign `windowPolicy`, its maximum.
 * `toKeyExclusive` is the EXCLUSIVE upper bound (callers convert an
 * inclusive `to` date key via `addDaysToDateKey(to, 1)`).
 */
export async function listBookableSlots(input: {
  provider: BookableWindowProvider;
  serviceId: string;
  durationMinutes: number;
  fromKey: string;
  toKeyExclusive?: string;
  limit?: number;
  now: Date;
  /** RESCHEDULE-SELF-SLOT: бронь, которую переносят — её окно не занято (см. usecases.ts). */
  excludeBookingId?: string;
  /**
   * MANUAL-BOOKING-SLOTS-01: окно для ОПЕРАТОРА — ручной записи мастером или
   * администратором студии. Ручные пути `minBookingHoursAhead` намеренно не
   * проверяют (это правило для клиентов: мастер, записывающий звонок на
   * через полчаса, его не нарушает), поэтому и пикер прячет только прошедшие
   * окошки. Решает роут и только для своей стороны кабинета.
   */
  operatorWindow?: boolean;
  /**
   * BOOKING-WINDOW-SPLIT (2026-09-24): окно записи ВЛАДЕЛЬЦА услуги, если он не
   * `provider`. Запись на услугу студии проверяет окно СТУДИИ
   * (`resolveBookingCore` → `assertBookingWindow(provider = студия)`), а окошки
   * считаются по мастеру — без этого виджет студии показывал окошки по правилам
   * мастера, и сервер отвечал `BOOKING_TOO_SOON`. Когда задано, применяются и
   * минимум, и максимум этого окна (перенос проверяет то же окно). Для
   * операторского окна не действует.
   */
  windowPolicy?: Pick<ProviderPolicy, "minBookingHoursAhead" | "maxBookingDaysAhead">;
  /**
   * 29.09 доработки · 07 (решение владельца): для администратора студии в
   * операторском окне действует «максимум вперёд» (строже из студии и мастера)
   * — окошки дальше него запись всё равно отклонит. Мастеру в своей ручной
   * записи не передаётся.
   */
  operatorMaxWindow?: Pick<ProviderPolicy, "maxBookingDaysAhead">;
}): Promise<BookableSlotsResult> {
  const { provider, serviceId, durationMinutes, fromKey, toKeyExclusive, limit, now } = input;

  const result = await listAvailabilitySlotsPaginated(provider.id, serviceId, durationMinutes, {
    fromKey,
    toKeyExclusive,
    limit,
    excludeBookingId: input.excludeBookingId,
  });
  if (!result.ok) {
    return { ok: false, status: result.status, code: result.code, message: result.message };
  }

  // EXP-025: anything before `now + minBookingHoursAhead` is non-bookable.
  // This is the cutoff `/slots` already applied and `/availability` lacked.
  const earliestBookable = input.operatorWindow
    ? now
    : earliestBookableUtc(input.windowPolicy ?? provider, now);
  const latestBookable = input.operatorWindow
    ? input.operatorMaxWindow
      ? latestBookableUtc(input.operatorMaxWindow, now)
      : null
    : input.windowPolicy
      ? latestBookableUtc(input.windowPolicy, now)
      : null;

  const slots = result.data.slots.filter((slot) => {
    const startsAt = toDate(slot.startAtUtc);
    if (!startsAt) return false;
    if (startsAt.getTime() < earliestBookable.getTime()) return false;
    if (latestBookable && startsAt.getTime() > latestBookable.getTime()) return false;

    return true;
  });

  return { ok: true, slots, meta: result.data.meta };
}
