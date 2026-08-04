import { describe, expect, it } from "vitest";
import { formatLocalHm, getLocalTimeParts, toLocalDateKey } from "./timezone";

/**
 * FIX-EXP-TZ-CROSS-SURFACE — the entity-tz "HH:MM" formatter. The cross-surface
 * bug class (EXP-017/019) came from formatters that read `getUTCHours()` (UTC)
 * or `getHours()` (host tz) instead of the salon/entity tz. `formatLocalHm`
 * makes the tz a REQUIRED arg so a booking time is always shown in the entity's
 * own tz — the same instant renders identically on every surface.
 */
describe("formatLocalHm", () => {
  // 06:00 UTC: a real-UTC booking instant. Yekaterinburg +5 → 11:00, Moscow +3 → 09:00.
  const instant = new Date("2026-07-04T06:00:00.000Z");

  it("formats a UTC instant in Asia/Yekaterinburg (+5)", () => {
    expect(formatLocalHm(instant, "Asia/Yekaterinburg")).toBe("11:00");
  });

  it("formats the SAME instant differently in Europe/Moscow (+3)", () => {
    expect(formatLocalHm(instant, "Europe/Moscow")).toBe("09:00");
  });

  it("formats in UTC when timeZone is UTC", () => {
    expect(formatLocalHm(instant, "UTC")).toBe("06:00");
  });

  it("zero-pads single-digit hours and minutes", () => {
    // 23:05 UTC → Yekaterinburg +5 = 04:05 next day.
    expect(formatLocalHm(new Date("2026-07-04T23:05:00.000Z"), "Asia/Yekaterinburg")).toBe("04:05");
    // 02:09 local check via a UTC instant that lands on 02:09 Yekaterinburg (21:09 prev UTC).
    expect(formatLocalHm(new Date("2026-07-03T21:09:00.000Z"), "Asia/Yekaterinburg")).toBe("02:09");
  });

  it("agrees with getLocalTimeParts (same underlying tz resolution)", () => {
    const parts = getLocalTimeParts(instant, "Asia/Yekaterinburg");
    const expected = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
    expect(formatLocalHm(instant, "Asia/Yekaterinburg")).toBe(expected);
  });

  it("midnight rolls the local date forward for east-of-UTC tz (sanity vs toLocalDateKey)", () => {
    // 22:30 UTC on 2026-07-04 → Yekaterinburg 03:30 on 2026-07-05.
    const lateNight = new Date("2026-07-04T22:30:00.000Z");
    expect(formatLocalHm(lateNight, "Asia/Yekaterinburg")).toBe("03:30");
    expect(toLocalDateKey(lateNight, "Asia/Yekaterinburg")).toBe("2026-07-05");
  });
});
