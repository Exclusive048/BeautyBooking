import test from "node:test";
import assert from "node:assert/strict";
import { findWorkingDays } from "@/lib/schedule/booking-days";
import type { DayPlan } from "@/lib/schedule/types";

const working = new Set(["2026-02-06", "2026-02-09", "2026-02-10"]);

test("booking-days skips weekends and returns next working days", async () => {
  const result = await findWorkingDays({
    fromKey: "2026-02-06",
    limit: 3,
    maxScan: 10,
    getDayPlan: async (dateKey) =>
      ({
        isWorking: working.has(dateKey),
        workingIntervals: working.has(dateKey) ? [{ start: "10:00", end: "19:00" }] : [],
        breaks: [],
        meta: { source: "weekly-template" },
      }) as DayPlan,
  });

  assert.deepEqual(
    result.days.map((day) => day.date),
    ["2026-02-06", "2026-02-09", "2026-02-10"]
  );
  assert.equal(result.nextFrom, "2026-02-11");
});
