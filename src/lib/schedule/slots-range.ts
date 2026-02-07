import type { AvailabilitySlot } from "@/lib/domain/schedule";
import { compareDateKeys } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";

type SlotLike = AvailabilitySlot | { startAtUtc: string };

export function filterSlotsByDateKey(input: {
  slots: SlotLike[];
  fromKey: string;
  toKey: string;
  timeZone: string;
}): SlotLike[] {
  return input.slots.filter((slot) => {
    const key = toLocalDateKey(slot.startAtUtc, input.timeZone);
    return compareDateKeys(key, input.fromKey) >= 0 && compareDateKeys(key, input.toKey) < 0;
  });
}
