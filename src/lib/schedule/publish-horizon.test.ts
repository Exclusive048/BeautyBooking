import { describe, expect, it } from "vitest";
import {
  PUBLISH_HORIZON_WEEKS,
  applyPublishHorizon,
  resolvePublishedUntilLocal,
} from "@/lib/schedule/publish-horizon";
import type { DayPlan } from "@/lib/schedule/types";

const TZ = "Europe/Moscow";

describe("schedule/publish-horizon — resolvePublishedUntilLocal", () => {
  it("anchors horizon to nowUtc regardless of whether changeAtUtc is set", () => {
    const nowUtc = new Date("2026-05-10T09:00:00.000Z");

    const withRecentEdit = resolvePublishedUntilLocal({
      changeAtUtc: new Date("2026-05-09T12:00:00.000Z"),
      nowUtc,
      timeZone: TZ,
    });
    const withoutEdit = resolvePublishedUntilLocal({
      changeAtUtc: null,
      nowUtc,
      timeZone: TZ,
    });

    expect(withRecentEdit).toBe(withoutEdit);
    // 2026-05-10 (MSK) + 42 days = 2026-06-21
    expect(withRecentEdit).toBe("2026-06-21");
    expect(PUBLISH_HORIZON_WEEKS).toBe(6);
  });

  it("does NOT freeze horizon to a stale changeAtUtc (regression: 42-day cliff)", () => {
    const nowUtc = new Date("2026-05-10T09:00:00.000Z");
    // Master last edited schedule 70 days ago — older than the 42-day window.
    const staleEdit = new Date("2026-03-01T09:00:00.000Z");

    const result = resolvePublishedUntilLocal({
      changeAtUtc: staleEdit,
      nowUtc,
      timeZone: TZ,
    });

    // Horizon must roll forward with `now`, NOT remain pinned at staleEdit + 42d.
    expect(result).toBe("2026-06-21");
    expect(result).not.toBe("2026-04-12");
  });
});

describe("schedule/publish-horizon — applyPublishHorizon", () => {
  const baseWorkingPlan: DayPlan = {
    isWorking: true,
    workingIntervals: [{ start: "10:00", end: "18:00" }],
    breaks: [],
    meta: { source: "weekly-template" },
  };

  it("passes through plan when dateKey is within horizon", () => {
    const result = applyPublishHorizon({
      plan: baseWorkingPlan,
      dateKey: "2026-05-15",
      publishedUntilLocal: "2026-06-21",
    });
    expect(result.isWorking).toBe(true);
    expect(result.workingIntervals).toHaveLength(1);
    expect(result.meta.publishedUntilLocal).toBe("2026-06-21");
  });

  it("blanks plan beyond horizon with out_of_publish_horizon reason", () => {
    const result = applyPublishHorizon({
      plan: baseWorkingPlan,
      dateKey: "2026-07-01",
      publishedUntilLocal: "2026-06-21",
    });
    expect(result.isWorking).toBe(false);
    expect(result.workingIntervals).toHaveLength(0);
    expect(result.meta.reason).toBe("out_of_publish_horizon");
  });
});
