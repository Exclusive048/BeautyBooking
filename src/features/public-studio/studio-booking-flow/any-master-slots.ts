import type { SlotItem } from "@/features/booking/lib/studio-booking";

/**
 * BOOKING-FLOW-AUDIT-RESIDUALS — «Любой мастер» в виджете студии: ОБЪЕДИНЕНИЕ
 * окошек всех мастеров услуги. Раньше показывались окошки только первого
 * мастера, у которого они были, — время, свободное лишь у второго, клиенту не
 * предлагалось. Окошко помнит мастера (первого по порядку, у кого оно есть),
 * и запись уходит к нему; слот этого мастера сохраняется целиком (у мастеров
 * разная длительность услуги — конец окошка может различаться).
 */
export function mergeAnyMasterSlots(
  masters: ReadonlyArray<{ id: string }>,
  slotsByMaster: Readonly<Record<string, { slots: SlotItem[] } | undefined>>,
): Array<{ slot: SlotItem; masterId: string }> {
  const byLabel = new Map<string, { slot: SlotItem; masterId: string }>();
  for (const master of masters) {
    for (const slot of slotsByMaster[master.id]?.slots ?? []) {
      if (!byLabel.has(slot.label)) byLabel.set(slot.label, { slot, masterId: master.id });
    }
  }
  return Array.from(byLabel.values()).sort(
    (left, right) => new Date(left.slot.startAtUtc).getTime() - new Date(right.slot.startAtUtc).getTime(),
  );
}
