import { HOT_SLOT_REBOOK_BLOCK_HOURS } from "@/lib/hot-slots/constants";

const BLOCK_WINDOW_MS = HOT_SLOT_REBOOK_BLOCK_HOURS * 60 * 60 * 1000;

export function isHotSlotRebookBlocked(cancelledAtUtc: Date | null | undefined, slotStartAtUtc: Date): boolean {
  if (!(cancelledAtUtc instanceof Date) || Number.isNaN(cancelledAtUtc.getTime())) return false;
  if (!(slotStartAtUtc instanceof Date) || Number.isNaN(slotStartAtUtc.getTime())) return false;
  const diff = slotStartAtUtc.getTime() - cancelledAtUtc.getTime();
  return diff > 0 && diff <= BLOCK_WINDOW_MS;
}
