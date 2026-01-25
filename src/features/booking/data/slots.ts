import type { Slot } from "../model/types";

export function makeMockSlots(): Slot[] {
  // MVP: фиксированные слоты, чтобы показать механику
  return [
    { id: "t1", label: "Сегодня · 12:30" },
    { id: "t2", label: "Сегодня · 15:00" },
    { id: "t3", label: "Сегодня · 18:30" },
    { id: "t4", label: "Завтра · 11:00" },
    { id: "t5", label: "Завтра · 13:30" },
    { id: "t6", label: "Завтра · 17:00" },
  ];
}
