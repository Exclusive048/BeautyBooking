import type { AvailabilitySlot } from "@/lib/domain/schedule";
import * as cache from "@/lib/cache/cache";

const SLOTS_TTL_SECONDS = 90;

export function buildSlotsCacheKey(input: {
  masterId: string;
  dateKey: string;
  serviceId: string;
  serviceDuration: number;
  bufferMin: number;
  timeZone: string;
  scheduleVersion: string;
  publishedUntilLocal: string;
}): string {
  return `slots:${input.masterId}:${input.dateKey}:${input.serviceId}:${input.serviceDuration}:${input.bufferMin}:${input.timeZone}:${input.scheduleVersion}:${input.publishedUntilLocal}`;
}

export async function getCachedSlots(key: string): Promise<AvailabilitySlot[] | null> {
  return cache.get<AvailabilitySlot[]>(key);
}

export async function setCachedSlots(key: string, slots: AvailabilitySlot[]): Promise<void> {
  await cache.set(key, slots, SLOTS_TTL_SECONDS);
}

export async function invalidateSlotsForMaster(masterId: string): Promise<void> {
  await cache.delByPattern(`slots:${masterId}:*`);
}
