import { describe, it, expect } from "vitest";
import { isValidTimeZone, formatLocalHm } from "@/lib/schedule/timezone";
import { updateMasterProfileSchema } from "@/lib/master/schemas";

describe("isValidTimeZone — HARDENING-06 FIX-10", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Asia/Yekaterinburg")).toBe(true);
    expect(isValidTimeZone("Europe/Moscow")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects empty / whitespace / too-short", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
    expect(isValidTimeZone("ab")).toBe(false);
  });

  it("rejects a non-IANA string", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("Moscow")).toBe(false); // the IANA id is Europe/Moscow
    expect(isValidTimeZone("Totally Bogus")).toBe(false);
  });
});

describe("partsFromDate read-time fallback (via formatLocalHm)", () => {
  const instant = new Date("2026-07-07T08:30:00.000Z"); // 11:30 Moscow (+3), 13:30 EKB (+5)

  it("a bad stored tz falls back to Europe/Moscow instead of throwing RangeError", () => {
    expect(() => formatLocalHm(instant, "")).not.toThrow();
    expect(formatLocalHm(instant, "")).toBe(formatLocalHm(instant, "Europe/Moscow"));
    expect(formatLocalHm(instant, "Not/AZone")).toBe(formatLocalHm(instant, "Europe/Moscow"));
    expect(formatLocalHm(instant, "")).toBe("11:30");
  });

  it("a valid tz is unaffected (no fallback)", () => {
    expect(formatLocalHm(instant, "Asia/Yekaterinburg")).toBe("13:30");
  });
});

describe("updateMasterProfileSchema.timezone — write-time rejection", () => {
  it("rejects an empty string", () => {
    expect(updateMasterProfileSchema.safeParse({ timezone: "" }).success).toBe(false);
  });

  it("rejects a non-IANA tz", () => {
    expect(updateMasterProfileSchema.safeParse({ timezone: "Not/AZone" }).success).toBe(false);
  });

  it("accepts a valid IANA tz", () => {
    expect(updateMasterProfileSchema.safeParse({ timezone: "Asia/Yekaterinburg" }).success).toBe(true);
  });

  it("accepts an omitted timezone (optional)", () => {
    expect(updateMasterProfileSchema.safeParse({}).success).toBe(true);
  });
});
