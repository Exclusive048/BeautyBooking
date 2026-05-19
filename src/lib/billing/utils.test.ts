import { describe, it, expect } from "vitest";
import { addMonthsUtc, formatTimeBucketUtc, sha256 } from "@/lib/billing/utils";

describe("billing/utils — sha256", () => {
  it("returns 64-char hex digest", () => {
    const hash = sha256("hello");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    expect(sha256("yookassa-payment-key-42")).toEqual(sha256("yookassa-payment-key-42"));
  });

  it("produces distinct output for different inputs", () => {
    expect(sha256("a")).not.toEqual(sha256("b"));
  });
});

describe("billing/utils — formatTimeBucketUtc", () => {
  it("formats UTC date as YYYY-MM-DD-HH", () => {
    const d = new Date(Date.UTC(2026, 4, 18, 14, 30, 0));
    expect(formatTimeBucketUtc(d)).toBe("2026-05-18-14");
  });

  it("zero-pads month/day/hour", () => {
    const d = new Date(Date.UTC(2026, 0, 5, 3, 0, 0));
    expect(formatTimeBucketUtc(d)).toBe("2026-01-05-03");
  });

  it("uses UTC components (ignores local offset)", () => {
    // 23:59 UTC always renders as 23 — never shifted to the next day
    const d = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
    expect(formatTimeBucketUtc(d)).toBe("2026-12-31-23");
  });
});

describe("billing/utils — addMonthsUtc (period boundary math for billing)", () => {
  it("adds positive month delta preserving day-of-month", () => {
    const start = new Date(Date.UTC(2026, 0, 15, 12, 0, 0)); // Jan 15
    const result = addMonthsUtc(start, 3);
    expect(result.toISOString()).toBe("2026-04-15T12:00:00.000Z");
  });

  it("clamps day-of-month when target month is shorter", () => {
    // Jan 31 + 1 month → Feb (28 days in 2026) → Feb 28, NOT Mar 3
    const jan31 = new Date(Date.UTC(2026, 0, 31, 8, 0, 0));
    const result = addMonthsUtc(jan31, 1);
    expect(result.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(result.getUTCDate()).toBe(28);
  });

  it("clamps leap-year boundary correctly", () => {
    // Mar 30, 2024 + 11 months → Feb 29, 2025... but 2025 is not a leap year → Feb 28
    const mar30 = new Date(Date.UTC(2025, 2, 30, 0, 0, 0));
    const result = addMonthsUtc(mar30, 11);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(28);
  });

  it("handles year rollover", () => {
    const dec15 = new Date(Date.UTC(2026, 11, 15, 9, 0, 0));
    const result = addMonthsUtc(dec15, 1);
    expect(result.getUTCFullYear()).toBe(2027);
    expect(result.getUTCMonth()).toBe(0);
    expect(result.getUTCDate()).toBe(15);
  });

  it("handles 12-month yearly renewal", () => {
    // Annual billing period: same day/time, next year
    const start = new Date(Date.UTC(2026, 5, 18, 14, 30, 45));
    const result = addMonthsUtc(start, 12);
    expect(result.toISOString()).toBe("2027-06-18T14:30:45.000Z");
  });

  it("handles 6-month half-yearly billing", () => {
    const jan1 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const result = addMonthsUtc(jan1, 6);
    expect(result.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("preserves milliseconds", () => {
    const start = new Date(Date.UTC(2026, 4, 1, 10, 20, 30, 456));
    const result = addMonthsUtc(start, 1);
    expect(result.getUTCMilliseconds()).toBe(456);
  });

  it("zero months returns equivalent date", () => {
    const start = new Date(Date.UTC(2026, 4, 18, 12, 0, 0));
    const result = addMonthsUtc(start, 0);
    expect(result.toISOString()).toBe(start.toISOString());
  });
});
