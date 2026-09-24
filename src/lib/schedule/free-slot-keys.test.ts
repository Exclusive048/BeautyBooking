import { describe, expect, it } from "vitest";
import { buildFreeSlotKeys, freeSlotHourKey, sameFreeSlotKeys } from "./free-slot-keys";

/**
 * CATALOG-DATE-TIME-FILTER — ключи снимка свободного времени строятся в поясе
 * САЛОНА (rule 17): окошко 08:00Z у екатеринбургской студии (+5) — это
 * 13:00 по салону, день и час ключа берутся оттуда, а не из UTC.
 *
 * @probe 2026-09-24 — в `buildFreeSlotKeys` час взят из `start.getUTCHours()`:
 * красные «ключи — в поясе салона» (ключ `…T08` вместо `…T13`) и «окошко
 * после полуночи салона…».
 */
describe("снимок свободного времени", () => {
  it("ключи — в поясе салона", () => {
    const keys = buildFreeSlotKeys(
      [new Date("2026-09-30T08:00:00.000Z"), new Date("2026-09-30T08:30:00.000Z")],
      "Asia/Yekaterinburg",
    );
    expect(keys).toEqual(["2026-09-30", "2026-09-30T13"]);
  });

  it("окошко после полуночи салона — следующий день салона", () => {
    // 20:00Z = 01:00 следующего дня по Екатеринбургу
    expect(buildFreeSlotKeys([new Date("2026-09-30T20:00:00.000Z")], "Asia/Yekaterinburg")).toEqual([
      "2026-10-01",
      "2026-10-01T01",
    ]);
  });

  it("ключ часа — с ведущим нулём", () => {
    expect(freeSlotHourKey("2026-09-30", 9)).toBe("2026-09-30T09");
  });

  it("сравнение снимков не зависит от порядка", () => {
    expect(sameFreeSlotKeys(["b", "a"], ["a", "b"])).toBe(true);
    expect(sameFreeSlotKeys(["a"], ["a", "b"])).toBe(false);
  });
});
