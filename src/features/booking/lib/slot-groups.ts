import type { SlotGroup } from "@/features/booking/model/types";
import { timeToMinutes } from "@/lib/schedule/time";
import type { SlotItem } from "@/features/booking/lib/studio-booking";

export function groupSlotsByDayPeriod(slots: SlotItem[]): SlotGroup[] {
  const items = slots
    .map((slot) => {
      const [, time] = slot.label.split(" ");
      if (!time) return null;
      const minutes = timeToMinutes(time);
      if (minutes === null) return null;
      return { label: slot.label, minutes };
    })
    .filter((v): v is { label: string; minutes: number } => Boolean(v));

  items.sort((a, b) => a.minutes - b.minutes);

  const groups = [
    { id: "morning", label: "Утро", items: [] as string[] },
    { id: "day", label: "День", items: [] as string[] },
    { id: "evening", label: "Вечер", items: [] as string[] },
  ];

  for (const item of items) {
    const group = item.minutes < 13 * 60 ? groups[0] : item.minutes < 18 * 60 ? groups[1] : groups[2];
    group.items.push(item.label);
  }

  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({ id: g.id, label: g.label, items: g.items }));
}
