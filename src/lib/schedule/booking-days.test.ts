import { findWorkingDays } from "@/lib/schedule/booking-days";
import { describe, it, expect, vi } from "vitest";
describe("schedule/booking-days", () => {
  it("collects working days and skips non-working", async () => {
    const getDayPlan = vi.fn(async (dateKey: string) => ({
      isWorking: dateKey !== "2026-03-02",
      workingIntervals: [],
      breaks: [],
      meta: { source: "weekly-template" as const },
    }));

    const result = await findWorkingDays({
      fromKey: "2026-03-01",
      limit: 2,
      maxScan: 5,
      getDayPlan,
    });

    expect(result.days.map((day) => day.date)).toEqual(["2026-03-01", "2026-03-03"]);
    expect(result.nextFrom).toBe("2026-03-04");
  });

  it("respects maxScan when no working days", async () => {
    const getDayPlan = vi.fn(async () => ({
      isWorking: false,
      workingIntervals: [],
      breaks: [],
      meta: { source: "weekly-template" as const },
    }));

    const result = await findWorkingDays({
      fromKey: "2026-03-01",
      limit: 2,
      maxScan: 2,
      getDayPlan,
    });

    expect(result.days).toEqual([]);
    expect(result.nextFrom).toBe("2026-03-03");
  });
});
