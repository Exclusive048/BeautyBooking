import { describe, expect, it } from "vitest";
import { resolveFlushAfterParam } from "@/lib/schedule/flush-after";

// SLOTS-FLUSH-STARTS: `?after=` у выдачи окошек — подсказка; мусор молча не
// учитывается. День, к которому момент относится, решает выдача
// (`buildSlotsForDay` берёт начало только в его день салона — `slots.test.ts`).
describe("resolveFlushAfterParam", () => {
  it("берёт момент из ISO-строки", () => {
    expect(resolveFlushAfterParam("2026-03-03T10:20:00.000Z")?.toISOString()).toBe(
      "2026-03-03T10:20:00.000Z",
    );
  });

  it("не учитывает пустое значение и мусор", () => {
    expect(resolveFlushAfterParam(null)).toBeNull();
    expect(resolveFlushAfterParam("")).toBeNull();
    expect(resolveFlushAfterParam("не дата")).toBeNull();
  });
});
