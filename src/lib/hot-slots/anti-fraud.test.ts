import { isHotSlotRebookBlocked } from "@/lib/hot-slots/anti-fraud";
import { describe, it, expect } from "vitest";
describe("hot-slots/anti-fraud", () => {
  it("blocks rebook within window", () => {
    const cancelledAt = new Date("2026-03-01T00:00:00Z");
    const slotStart = new Date("2026-03-01T10:00:00Z");
    expect(isHotSlotRebookBlocked(cancelledAt, slotStart)).toBe(true);
  });

  it("allows rebook outside window", () => {
    const cancelledAt = new Date("2026-03-01T00:00:00Z");
    const slotStart = new Date("2026-03-03T00:00:01Z");
    expect(isHotSlotRebookBlocked(cancelledAt, slotStart)).toBe(false);
  });

  it("handles invalid dates safely", () => {
    expect(isHotSlotRebookBlocked(null, new Date())).toBe(false);
    expect(isHotSlotRebookBlocked(new Date("bad"), new Date())).toBe(false);
  });
});
