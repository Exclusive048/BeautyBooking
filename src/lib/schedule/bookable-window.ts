import { prisma } from "@/lib/prisma";
import type { AvailabilitySlot } from "@/lib/domain/schedule";
import {
  listAvailabilitySlotsPaginated,
  type AvailabilitySlotsPageMeta,
} from "@/lib/schedule/usecases";
import { dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";
import { SCHEDULE_OVERRIDE_RANGE_ORDER } from "@/lib/schedule/override-order";
import { earliestBookableUtc } from "@/lib/bookings/policy-enforcement";

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
 */

export type BookableWindowProvider = {
  id: string;
  timezone: string;
  minBookingHoursAhead: number;
};

export type BookableSlotsResult =
  | { ok: true; slots: AvailabilitySlot[]; meta: AvailabilitySlotsPageMeta }
  | { ok: false; status: number; code?: string; message: string };

type EffectiveSchedule = {
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotSet: Set<string>;
};

function normalizeFixedSlotTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute % 5 !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFixedSlotTimes(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeFixedSlotTime(value);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function dayIndexFromDateKey(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns the bookable slots for a provider/service within a date range:
 * the schedule engine output, filtered by (1) the `minBookingHoursAhead`
 * cutoff and (2) the effective weekly/override workday + FIXED-mode rules.
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

  const rangeFromUtc = dateFromLocalDateKey(result.data.meta.fromDate, provider.timezone, 0, 0);
  const rangeToExclusiveUtc = dateFromLocalDateKey(
    result.data.meta.toDateExclusive,
    provider.timezone,
    0,
    0,
  );

  const [weeklyConfig, overrides] = await Promise.all([
    prisma.weeklyScheduleConfig.findUnique({
      where: { providerId: provider.id },
      select: {
        days: {
          select: {
            weekday: true,
            isActive: true,
            scheduleMode: true,
            fixedSlotTimes: true,
            templateId: true,
          },
        },
      },
    }),
    prisma.scheduleOverride.findMany({
      where: { providerId: provider.id, date: { gte: rangeFromUtc, lt: rangeToExclusiveUtc } },
      select: {
        date: true,
        isDayOff: true,
        isWorkday: true,
        scheduleMode: true,
        fixedSlotTimes: true,
      },
      // LOGIC-11: тот же канон, что у движка и у guard'а.
      orderBy: SCHEDULE_OVERRIDE_RANGE_ORDER,
    }),
  ]);

  const weekByDay = new Map<number, EffectiveSchedule>();
  for (const day of weeklyConfig?.days ?? []) {
    weekByDay.set(day.weekday, {
      isWorkday: Boolean(day.isActive && day.templateId),
      scheduleMode: day.scheduleMode ?? "FLEXIBLE",
      fixedSlotSet: new Set(normalizeFixedSlotTimes(day.fixedSlotTimes ?? [])),
    });
  }

  const exceptionsByDate = new Map<string, EffectiveSchedule>();
  for (const row of overrides) {
    const dateKey = toLocalDateKey(row.date, provider.timezone);
    // LOGIC-11: побеждает ПЕРВАЯ строка — как в движке. Раньше здесь стоял
    // безусловный `set`, то есть при дублях выигрывала ПОСЛЕДНЯЯ, и генератор
    // слотов расходился с guard'ом рабочих часов даже при одинаковом порядке
    // выборки.
    if (exceptionsByDate.has(dateKey)) continue;
    const fixedTimes = normalizeFixedSlotTimes(row.fixedSlotTimes ?? []);
    exceptionsByDate.set(dateKey, {
      isWorkday: row.isWorkday ?? !row.isDayOff,
      scheduleMode: row.scheduleMode ?? (fixedTimes.length > 0 ? "FIXED" : "FLEXIBLE"),
      fixedSlotSet: new Set(fixedTimes),
    });
  }

  const effectiveCache = new Map<string, EffectiveSchedule>();
  const getEffective = (dateKey: string): EffectiveSchedule => {
    const cached = effectiveCache.get(dateKey);
    if (cached) return cached;

    const fromException = exceptionsByDate.get(dateKey);
    if (fromException) {
      effectiveCache.set(dateKey, fromException);
      return fromException;
    }

    const weekday = dayIndexFromDateKey(dateKey) + 1;
    const fromWeek = weekByDay.get(weekday);
    if (fromWeek) {
      effectiveCache.set(dateKey, fromWeek);
      return fromWeek;
    }

    const fallback: EffectiveSchedule = {
      isWorkday: true,
      scheduleMode: "FLEXIBLE",
      fixedSlotSet: new Set<string>(),
    };
    effectiveCache.set(dateKey, fallback);
    return fallback;
  };

  // EXP-025: anything before `now + minBookingHoursAhead` is non-bookable.
  // This is the cutoff `/slots` already applied and `/availability` lacked.
  const earliestBookable = earliestBookableUtc(provider, now);

  const slots = result.data.slots.filter((slot) => {
    const startsAt = toDate(slot.startAtUtc);
    if (!startsAt) return false;
    if (startsAt.getTime() < earliestBookable.getTime()) return false;

    const dateKey = toLocalDateKey(startsAt, provider.timezone);
    const effective = getEffective(dateKey);

    if (!effective.isWorkday) return false;
    if (effective.scheduleMode !== "FIXED") return true;
    if (effective.fixedSlotSet.size === 0) return false;

    const { hour, minute } = getLocalTimeParts(startsAt, provider.timezone);
    const localTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return effective.fixedSlotSet.has(localTime);
  });

  return { ok: true, slots, meta: result.data.meta };
}
