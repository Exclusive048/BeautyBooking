import { buildBookingOverlapWhere } from "@/lib/schedule/overlap";
import { describe, it, expect } from "vitest";
describe("schedule/overlap", () => {
  it("builds overlap predicate with exclusive boundaries", () => {
    const from = new Date("2026-03-01T10:00:00Z");
    const to = new Date("2026-03-01T12:00:00Z");
    const where = buildBookingOverlapWhere(from, to);

    expect(where.startAtUtc.not).toBeNull();
    expect(where.startAtUtc.lt).toEqual(to);
    expect(where.endAtUtc.not).toBeNull();
    expect(where.endAtUtc.gt).toEqual(from);
  });
});
