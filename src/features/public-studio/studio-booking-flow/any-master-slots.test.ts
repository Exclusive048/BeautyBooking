import { describe, expect, it } from "vitest";
import { mergeAnyMasterSlots } from "./any-master-slots";

/**
 * «Любой мастер» — объединение окошек мастеров услуги.
 *
 * @probe 2026-09-24 — `mergeAnyMasterSlots` возвращает окошки только первого
 * мастера с окошками (прежнее поведение): красный «окошко только у второго
 * мастера тоже предлагается».
 */
const slot = (hhmm: string, end = hhmm) => ({
  label: hhmm,
  startAtUtc: `2026-09-30T${hhmm}:00.000Z`,
  endAtUtc: `2026-09-30T${end}:00.000Z`,
});

describe("«Любой мастер» — окошки всех мастеров", () => {
  it("окошко только у второго мастера тоже предлагается", () => {
    const merged = mergeAnyMasterSlots([{ id: "a" }, { id: "b" }], {
      a: { slots: [slot("10:00")] },
      b: { slots: [slot("12:00")] },
    });
    expect(merged.map((entry) => [entry.slot.label, entry.masterId])).toEqual([
      ["10:00", "a"],
      ["12:00", "b"],
    ]);
  });

  it("общее окошко уходит первому мастеру, с его концом окошка", () => {
    const merged = mergeAnyMasterSlots([{ id: "a" }, { id: "b" }], {
      a: { slots: [slot("10:00", "11:00")] },
      b: { slots: [slot("10:00", "11:30")] },
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ slot: slot("10:00", "11:00"), masterId: "a" });
  });

  it("по времени, а не по порядку мастеров", () => {
    const merged = mergeAnyMasterSlots([{ id: "a" }, { id: "b" }], {
      a: { slots: [slot("15:00")] },
      b: { slots: [slot("09:00")] },
    });
    expect(merged.map((entry) => entry.slot.label)).toEqual(["09:00", "15:00"]);
  });
});
