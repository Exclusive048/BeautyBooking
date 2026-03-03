import { filterSlotsByDateKey } from "@/lib/schedule/slots-range";
import { describe, it, expect } from "vitest";
describe("schedule/slots-range", () => {
  it("filters slots within [from,to) keys", () => {
    const slots = [
      { startAtUtc: "2026-03-03T10:00:00Z" },
      { startAtUtc: "2026-03-04T10:00:00Z" },
    ];
    const result = filterSlotsByDateKey({
      slots,
      fromKey: "2026-03-03",
      toKey: "2026-03-04",
      timeZone: "UTC",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.startAtUtc).toBe("2026-03-03T10:00:00Z");
  });

  it("excludes slots before fromKey", () => {
    const slots = [
      { startAtUtc: "2026-03-02T23:00:00Z" },
      { startAtUtc: "2026-03-03T01:00:00Z" },
    ];
    const result = filterSlotsByDateKey({
      slots,
      fromKey: "2026-03-03",
      toKey: "2026-03-04",
      timeZone: "UTC",
    });
    expect(result.map((item) => item.startAtUtc)).toEqual(["2026-03-03T01:00:00Z"]);
  });
});
