import { describe, expect, it } from "vitest";
import { freeSlotKeysForWhen, hoursForRange } from "./free-slot-keys-shared";

/**
 * CATALOG-DATE-TIME-FILTER — фильтр «когда» каталога переводится в ключи
 * снимка свободного времени: дата → ключ дня, дата + время → ключи часов,
 * только время → часы на весь горизонт.
 *
 * @probe 2026-09-24 — в `hoursForRange` верхняя граница `Math.ceil(to / 60)`
 * заменена на `Math.ceil(to / 60) + 1`: красный «утро — часы 9, 10, 11»
 * (в «утро» попадали окошки с 12:00).
 */
const NOW = new Date("2026-09-24T09:00:00.000Z");

describe("фильтр «когда» → ключи снимка", () => {
  it("без даты и времени — фильтра нет", () => {
    expect(freeSlotKeysForWhen({ now: NOW })).toBeNull();
    expect(freeSlotKeysForWhen({ date: "не дата", now: NOW })).toBeNull();
  });

  it("только дата — ключ дня", () => {
    expect(freeSlotKeysForWhen({ date: "2026-09-30", now: NOW })).toEqual(["2026-09-30"]);
  });

  it("утро — часы 9, 10, 11", () => {
    expect(hoursForRange("09:00", "12:00")).toEqual([9, 10, 11]);
    expect(freeSlotKeysForWhen({ date: "2026-09-30", timeFrom: "09:00", timeTo: "12:00", now: NOW })).toEqual([
      "2026-09-30T09",
      "2026-09-30T10",
      "2026-09-30T11",
    ]);
  });

  it("диапазон не по часу — захватывает неполный час", () => {
    expect(hoursForRange("09:30", "11:15")).toEqual([9, 10, 11]);
  });

  it("перевёрнутый диапазон времени не фильтрует", () => {
    expect(hoursForRange("18:00", "09:00")).toBeNull();
    expect(freeSlotKeysForWhen({ date: "2026-09-30", timeFrom: "18:00", timeTo: "09:00", now: NOW })).toEqual([
      "2026-09-30",
    ]);
  });

  it("только время — часы на весь горизонт (с запасом в сутки назад)", () => {
    const keys = freeSlotKeysForWhen({ timeFrom: "18:00", timeTo: "20:00", now: NOW }) ?? [];
    expect(keys).toContain("2026-09-23T18");
    expect(keys).toContain("2026-09-24T19");
    // горизонт — 30 дней салона: 24.09 … 23.10
    expect(keys).toContain("2026-10-23T18");
    expect(keys).not.toContain("2026-10-24T18");
    expect(keys).not.toContain("2026-09-24T20");
  });
});
