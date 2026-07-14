import { describe, expect, it } from "vitest";
import {
  AVAILABLE_TODAY_RECOMPUTE_JOB_TYPE,
  createAvailableTodayRecomputeJob,
  isJob,
} from "./types";

describe("availableToday.recompute queue job", () => {
  it("factory builds a normalized job carrying the providerId", () => {
    const job = createAvailableTodayRecomputeJob({ providerId: "prov-1" });
    expect(job.type).toBe(AVAILABLE_TODAY_RECOMPUTE_JOB_TYPE);
    expect(job.type).toBe("availableToday.recompute");
    expect(job.payload).toEqual({ providerId: "prov-1" });
    expect(typeof job.id).toBe("string");
    expect(job.id.length).toBeGreaterThan(0);
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBeGreaterThan(0);
    expect(typeof job.createdAt).toBe("number");
  });

  it("isJob accepts it — LOAD-BEARING: parseJob drops any type not registered in isJob", () => {
    expect(isJob(createAvailableTodayRecomputeJob({ providerId: "prov-1" }))).toBe(true);
  });

  it("isJob rejects a malformed payload", () => {
    expect(isJob({ id: "x", type: "availableToday.recompute", payload: {} })).toBe(false);
    expect(
      isJob({ id: "x", type: "availableToday.recompute", payload: { providerId: "" } }),
    ).toBe(false);
    expect(isJob({ id: "x", type: "availableToday.recompute" })).toBe(false);
    expect(
      isJob({ id: "x", type: "availableToday.recompute", payload: { providerId: 42 } }),
    ).toBe(false);
  });
});
