import type { AvailabilitySlot } from "@/lib/domain/schedule";
import * as cache from "@/lib/cache/cache";
import { toDateKey } from "@/lib/schedule/time";

const SLOTS_TTL_SECONDS = 90;

export function buildSlotsCacheKey(
  masterId: string,
  date: Date,
  serviceDuration: number
): string {
  const dateKey = toDateKey(date);
  return `slots:${masterId}:${dateKey}:${serviceDuration}`;
}

export async function getCachedSlots(
  masterId: string,
  date: Date,
  serviceDuration: number
): Promise<AvailabilitySlot[] | null> {
  const key = buildSlotsCacheKey(masterId, date, serviceDuration);
  return cache.get<AvailabilitySlot[]>(key);
}

export async function setCachedSlots(
  masterId: string,
  date: Date,
  serviceDuration: number,
  slots: AvailabilitySlot[]
): Promise<void> {
  const key = buildSlotsCacheKey(masterId, date, serviceDuration);
  await cache.set(key, slots, SLOTS_TTL_SECONDS);
}

export async function invalidateSlotsForMaster(masterId: string): Promise<void> {
  await cache.delByPattern(`slots:${masterId}:*`);
}
