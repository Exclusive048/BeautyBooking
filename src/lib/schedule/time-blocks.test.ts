import { describe, it, expect } from "vitest";
import { bucketRangesByDateKey, type TimeBlockRange } from "@/lib/schedule/time-blocks";

describe("schedule/time-blocks bucketRangesByDateKey", () => {
  // Yekaterinburg is UTC+5 — a deliberate non-MSK anchor (matches the Vision
  // fixture) so a block near salon-midnight files under the SALON-local day,
  // not the UTC day (SKILL-TZ-01).
  const YEKAT = "Asia/Yekaterinburg";

  it("buckets a block by its salon-local day, not its UTC day", () => {
    // 20:00Z–21:00Z is 01:00–02:00 the NEXT salon-local day at +5.
    const range: TimeBlockRange = {
      startAtUtc: new Date("2026-07-06T20:00:00Z"),
      endAtUtc: new Date("2026-07-06T21:00:00Z"),
    };
    const byKey = bucketRangesByDateKey([range], YEKAT);

    expect([...byKey.keys()]).toEqual(["2026-07-07"]);
    expect(byKey.get("2026-07-06")).toBeUndefined();
    expect(byKey.get("2026-07-07")).toHaveLength(1);
  });

  it("files a block that straddles a salon-local midnight under both days", () => {
    // 23:00 local 07-06 → 01:00 local 07-07 (18:00Z → 20:00Z at +5).
    const range: TimeBlockRange = {
      startAtUtc: new Date("2026-07-06T18:00:00Z"),
      endAtUtc: new Date("2026-07-06T20:00:00Z"),
    };
    const byKey = bucketRangesByDateKey([range], YEKAT);

    expect([...byKey.keys()].sort()).toEqual(["2026-07-06", "2026-07-07"]);
  });

  it("drops days outside the clamp window", () => {
    const range: TimeBlockRange = {
      startAtUtc: new Date("2026-07-06T18:00:00Z"), // 07-06 local
      endAtUtc: new Date("2026-07-06T20:00:00Z"), // 07-07 local
    };
    // Clamp start to 07-07 → the 07-06 bucket is dropped.
    const byKey = bucketRangesByDateKey([range], YEKAT, "2026-07-07");

    expect([...byKey.keys()]).toEqual(["2026-07-07"]);
  });
});
