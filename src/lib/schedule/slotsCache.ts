import type { AvailabilitySlot } from "@/lib/domain/schedule";
import * as cache from "@/lib/cache/cache";
import { listDateKeysExclusive } from "@/lib/schedule/dateKey";
import { toLocalDateKey, toLocalDateKeyExclusive } from "@/lib/schedule/timezone";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { invalidateScheduleVersion } from "@/lib/schedule/schedule-version-cache";
import { enqueueAvailableTodayRecompute } from "@/lib/schedule/available-today-recompute-enqueue";

const SLOTS_TTL_SECONDS = 120;
const SLOTS_INDEX_TTL_SECONDS = SLOTS_TTL_SECONDS;

/**
 * Ключ обязан перечислять ВСЕ входы `buildSlotsForDay`, влияющие на
 * результат. Три из них — от провайдера: `timeZone`, `bufferMin` и
 * `slotStepMin`.
 *
 * PERF-18 — `slotStepMin` здесь появился не для полноты: пока в
 * `scheduleVersion` входил `Provider.updatedAt`, шаг сетки покрывался им
 * побочно, и это было единственное, что его покрывало. Провайдер из версии
 * убран (её двигали отзывы и пересчёт `availableToday`), поэтому шаг обязан
 * стоять там же, где уже стоят его два соседа, — иначе смена шага в
 * настройках расписания отдавала бы старую сетку до истечения TTL.
 */
export function buildSlotsCacheKey(input: {
  masterId: string;
  dateKey: string;
  serviceId: string;
  serviceDuration: number;
  bufferMin: number;
  slotStepMin: number;
  timeZone: string;
  scheduleVersion: string;
  publishedUntilLocal: string;
}): string {
  return `slots:${input.masterId}:${input.dateKey}:${input.serviceId}:${input.serviceDuration}:${input.bufferMin}:${input.slotStepMin}:${input.timeZone}:${input.scheduleVersion}:${input.publishedUntilLocal}`;
}

function buildSlotsIndexKey(masterId: string, dateKey: string): string {
  return `slotsIndex:${masterId}:${dateKey}`;
}

export async function getCachedSlots(key: string): Promise<AvailabilitySlot[] | null> {
  return cache.get<AvailabilitySlot[]>(key);
}

export async function setCachedSlots(key: string, slots: AvailabilitySlot[]): Promise<void> {
  await cache.set(key, slots, SLOTS_TTL_SECONDS);
}

async function registerSlotsIndex(masterId: string, dateKey: string, cacheKey: string): Promise<void> {
  const indexKey = buildSlotsIndexKey(masterId, dateKey);
  const existing = await cache.get<string[]>(indexKey);
  if (existing && existing.includes(cacheKey)) {
    await cache.set(indexKey, existing, SLOTS_INDEX_TTL_SECONDS);
    return;
  }
  const next = existing ? [...existing, cacheKey] : [cacheKey];
  await cache.set(indexKey, next, SLOTS_INDEX_TTL_SECONDS);
}

export async function setCachedSlotsForDate(input: {
  key: string;
  masterId: string;
  dateKey: string;
  slots: AvailabilitySlot[];
}): Promise<void> {
  await cache.set(input.key, input.slots, SLOTS_TTL_SECONDS);
  await registerSlotsIndex(input.masterId, input.dateKey, input.key);
}

export async function invalidateSlotsForMaster(masterId: string): Promise<void> {
  await Promise.all([
    cache.delByPattern(`slots:${masterId}:*`),
    // PERF-04: `scheduleVersion` кэшируется (он же — часть ключа выше), и
    // сбрасывается ровно здесь: этот вызов и есть «расписание изменилось».
    // Порядок с `delByPattern` не важен — ключи разные, а любой промах по
    // версии заканчивается полным пересчётом.
    invalidateScheduleVersion(masterId),
    invalidateAdvisorCache(masterId),
  ]);
  // CATALOG-AVAILABLE-TODAY Phase 4: a schedule/day-off edit for this master
  // changes its today-availability → targeted `availableToday` recompute
  // (queued, never throws). Additional effect AFTER the existing invalidation.
  await enqueueAvailableTodayRecompute(masterId);
}

export async function invalidateSlotsForDateKeys(masterId: string, dateKeys: string[]): Promise<void> {
  const unique = Array.from(new Set(dateKeys.filter((key) => key.trim().length > 0)));
  for (const dateKey of unique) {
    const indexKey = buildSlotsIndexKey(masterId, dateKey);
    const indexed = await cache.get<string[]>(indexKey);
    if (indexed && indexed.length > 0) {
      await Promise.all(indexed.map((key) => cache.del(key)));
      await cache.del(indexKey);
      continue;
    }
    await cache.delByPattern(`slots:${masterId}:${dateKey}:*`);
  }
}

export function getBookingDateKeys(startAtUtc: Date, endAtUtc: Date, timeZone: string): string[] {
  const startKey = toLocalDateKey(startAtUtc, timeZone);
  const endKeyExclusive = toLocalDateKeyExclusive(endAtUtc, timeZone);
  return listDateKeysExclusive(startKey, endKeyExclusive);
}

export async function invalidateSlotsForBooking(
  masterId: string,
  bookingStartUtc: Date,
  bookingEndUtc: Date,
  providerTimeZone: string
): Promise<void> {
  const dateKeys = getBookingDateKeys(bookingStartUtc, bookingEndUtc, providerTimeZone);
  await invalidateSlotsForDateKeys(masterId, dateKeys);
  // CATALOG-AVAILABLE-TODAY Phase 4: a booking made/cancelled/moved for this
  // master changes its today-availability → targeted `availableToday` recompute
  // (queued, never throws). Additional effect AFTER the existing invalidation.
  // A cross-master move invalidates both masters (called once per master), so
  // both get recomputed. The handler fans out to the master's studio.
  await enqueueAvailableTodayRecompute(masterId);
}
