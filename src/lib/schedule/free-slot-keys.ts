import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { addDaysToDateKey, localDayRangeUtc } from "@/lib/schedule/dateKey";
import { buildBookingOverlapWhere } from "@/lib/schedule/overlap";
import { loadTimeBlockRanges } from "@/lib/schedule/time-blocks";
import { getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";
import { normalizeSlotStepMin } from "@/lib/schedule/editor-shared";
import { normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { earliestBookableUtc, latestBookableUtc } from "@/lib/bookings/policy-enforcement";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import { AVAILABILITY_PROBE_DURATION_MIN } from "@/lib/schedule/available-today";
import { FREE_SLOT_HORIZON_DAYS, freeSlotHourKey } from "@/lib/schedule/free-slot-keys-shared";

export { FREE_SLOT_HORIZON_DAYS, freeSlotHourKey };

/**
 * CATALOG-DATE-TIME-FILTER (2026-09-24) — снимок свободного времени для
 * фильтра каталога «когда».
 *
 * Каталог не может прогонять движок расписания по каждому провайдеру на
 * каждый запрос, поэтому ответ «есть ли свободное окошко в день D с HH:00» он
 * берёт из `Provider.freeSlotKeys`: ключ дня салона `YYYY-MM-DD` и ключ часа
 * `YYYY-MM-DDTHH`. Снимок пишет воркер вместе с `availableToday` (тем же
 * пересчётом, по образцу которого и сделан): при старте, раз в 30 минут и
 * точечно после изменений расписания и записей.
 *
 * 🔴 SERVER-ONLY (rule 13). 🔴 ENGINE-SAFETY: тот же чистый путь чтения, что у
 * `available-today.ts` (`getDayPlanFromContext` + чистый `buildSlotsForDay`),
 * без записи в кэш слотов — генерация окошек не меняется.
 *
 * Окошко — та же 30-минутная проба, что у «Свободно сегодня»: снимок отвечает
 * «есть ли время на типичную услугу», а не на конкретную (услуга в каталоге
 * необязательна). Горизонт — 30 дней, суженный окном записи провайдера
 * (`maxBookingDaysAhead`) и горизонтом видимости (`visibleSlotDays`); окошки
 * раньше «минимум за N часов» не считаются.
 */

export type FreeSlotProbeProvider = {
  id: string;
  timezone: string;
  slotStepMin: number | null;
  minBookingHoursAhead: number | null;
  maxBookingDaysAhead: number | null;
  visibleSlotDays: number | null;
  bufferBetweenBookingsMin: number | null;
};

type BookingWindow = { minBookingHoursAhead: number | null; maxBookingDaysAhead: number | null };

/** PURE: ключи дня и часа салона для начал свободных окошек (отсортированы, без дублей). */
export function buildFreeSlotKeys(slotStarts: readonly Date[], timeZone: string): string[] {
  const keys = new Set<string>();
  for (const start of slotStarts) {
    const dateKey = toLocalDateKey(start, timeZone);
    keys.add(dateKey);
    keys.add(freeSlotHourKey(dateKey, getLocalTimeParts(start, timeZone).hour));
  }
  return Array.from(keys).sort();
}

/**
 * Начала свободных окошек одного мастера на горизонт снимка. `window` — окно
 * записи, по которому отсекаются окошки (у мастера студии для карточки студии —
 * окно студии: её услуги проверяются ею).
 */
export async function providerFreeSlotStarts(
  provider: FreeSlotProbeProvider,
  now: Date,
  window: BookingWindow = provider,
): Promise<Date[]> {
  const timeZone = provider.timezone;
  const todayKey = toLocalDateKey(now, timeZone);
  const horizonDays = Math.max(
    1,
    Math.min(
      FREE_SLOT_HORIZON_DAYS,
      window.maxBookingDaysAhead ?? FREE_SLOT_HORIZON_DAYS,
      provider.visibleSlotDays ?? FREE_SLOT_HORIZON_DAYS,
    ),
  );
  const toKeyExclusive = addDaysToDateKey(todayKey, horizonDays);
  const rangeStart = localDayRangeUtc(todayKey, timeZone).startUtc;
  const rangeEnd = localDayRangeUtc(toKeyExclusive, timeZone).startUtc;

  const ctx = await createScheduleContext({
    providerId: provider.id,
    timezoneHint: timeZone,
    range: { fromKey: todayKey, toKeyExclusive },
  });

  const [bookingRows, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        OR: [{ masterProviderId: provider.id }, { masterProviderId: null, providerId: provider.id }],
        status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
        ...buildBookingOverlapWhere(rangeStart, rangeEnd),
      },
      select: { startAtUtc: true, endAtUtc: true },
    }),
    loadTimeBlockRanges(provider.id, rangeStart, rangeEnd),
  ]);
  const bookings = bookingRows.filter(
    (row): row is { startAtUtc: Date; endAtUtc: Date } => row.startAtUtc !== null && row.endAtUtc !== null,
  );

  const earliest = earliestBookableUtc({ minBookingHoursAhead: Math.max(0, window.minBookingHoursAhead ?? 0) }, now);
  const latest = latestBookableUtc({ maxBookingDaysAhead: window.maxBookingDaysAhead ?? FREE_SLOT_HORIZON_DAYS }, now);

  const starts: Date[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const dateKey = addDaysToDateKey(todayKey, offset);
    const plan = await ScheduleEngine.getDayPlanFromContext(ctx, dateKey);
    if (!plan.isWorking) continue;
    const slots = buildSlotsForDay({
      dayPlan: plan,
      dateKey,
      timeZone,
      serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
      bufferMin: normalizeBufferMinutes(provider.bufferBetweenBookingsMin),
      bookings,
      blocks,
      now,
      slotStepMin: normalizeSlotStepMin(provider.slotStepMin),
    });
    for (const slot of slots) {
      const at = slot.startAtUtc.getTime();
      if (at >= earliest.getTime() && at <= latest.getTime()) starts.push(slot.startAtUtc);
    }
  }
  return starts;
}

const PROBE_SELECT = {
  id: true,
  timezone: true,
  slotStepMin: true,
  minBookingHoursAhead: true,
  maxBookingDaysAhead: true,
  visibleSlotDays: true,
  bufferBetweenBookingsMin: true,
} as const;

/**
 * Ключи снимка провайдера. Мастер — свои окошки; студия — объединение окошек
 * её АКТИВНЫХ мастеров (инв. #24), отсечённых окном записи студии.
 */
export async function computeFreeSlotKeys(
  provider: FreeSlotProbeProvider & { type: ProviderType },
  now: Date = new Date(),
): Promise<string[]> {
  if (provider.type === ProviderType.MASTER) {
    return buildFreeSlotKeys(await providerFreeSlotStarts(provider, now), provider.timezone);
  }
  const masters = await prisma.provider.findMany({
    where: { type: ProviderType.MASTER, studioId: provider.id, ...STUDIO_ACTIVE_MASTER_WHERE },
    select: PROBE_SELECT,
  });
  const keys = new Set<string>();
  for (const master of masters) {
    const starts = await providerFreeSlotStarts(master, now, provider);
    for (const key of buildFreeSlotKeys(starts, master.timezone)) keys.add(key);
  }
  return Array.from(keys).sort();
}

export function sameFreeSlotKeys(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((key, index) => key === sortedRight[index]);
}

/** Поля провайдера, нужные для снимка (для `select` у вызывающих). */
export const FREE_SLOT_PROBE_SELECT = { ...PROBE_SELECT, type: true, freeSlotKeys: true } as const;
