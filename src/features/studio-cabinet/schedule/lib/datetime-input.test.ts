import { describe, expect, it } from "vitest";

import {
  salonInputToUtcIso,
  salonLocalDatetimeInput,
  utcIsoToSalonInput,
} from "./datetime-input";

/**
 * TZ-DISPLAY-SALON-PARITY-01 · FIX-4 — the risk surface.
 *
 * A `<input type="datetime-local">` is inherently browser-tz. These converters
 * make the studio admin edit the booking time as SALON-local wall-clock, then
 * convert back to UTC via the SALON tz (not the browser tz). Getting this wrong
 * shifts the *actual booked instant*, not just a label — so the round-trip is
 * proven here.
 *
 * Anchors: Vision = Asia/Yekaterinburg (UTC+5, no DST) — the non-Moscow anchor
 * (§5: Moscow-only testing masks the bug); Europe/Moscow (UTC+3) as control.
 * Both functions are Intl+tz explicit (no browser-local `getHours()`), so the
 * exact-string assertions below hold regardless of the test runner's own tz.
 */
const EKB = "Asia/Yekaterinburg"; // +5
const MSK = "Europe/Moscow"; // +3

describe("utcIsoToSalonInput — UTC instant → salon-local datetime-local value", () => {
  it("Vision (+5): 08:00Z booking shows as 13:00 salon-local in the input", () => {
    expect(utcIsoToSalonInput("2026-07-07T08:00:00.000Z", EKB)).toBe(
      "2026-07-07T13:00",
    );
  });

  it("Moscow control (+3): 08:00Z shows as 11:00", () => {
    expect(utcIsoToSalonInput("2026-07-07T08:00:00.000Z", MSK)).toBe(
      "2026-07-07T11:00",
    );
  });

  it("Vision (+5): a late-UTC instant that crosses midnight in salon tz shifts the date too", () => {
    // 20:00Z + 5h = 01:00 the NEXT salon-local day.
    expect(utcIsoToSalonInput("2026-07-06T20:00:00.000Z", EKB)).toBe(
      "2026-07-07T01:00",
    );
  });

  it("pads single-digit hour/minute", () => {
    // 04:05Z + 5h = 09:05 EKB.
    expect(utcIsoToSalonInput("2026-07-07T04:05:00.000Z", EKB)).toBe(
      "2026-07-07T09:05",
    );
  });

  it("returns '' for a malformed instant (never a host-tz fallback string)", () => {
    expect(utcIsoToSalonInput("not-an-iso", EKB)).toBe("");
    expect(utcIsoToSalonInput("", EKB)).toBe("");
  });
});

describe("salonInputToUtcIso — salon-local datetime-local value → UTC instant", () => {
  it("Vision (+5): 13:00 salon-local → 08:00Z (interpreted in SALON tz, not browser)", () => {
    expect(salonInputToUtcIso("2026-07-07T13:00", EKB)).toBe(
      "2026-07-07T08:00:00.000Z",
    );
  });

  it("Moscow control (+3): 11:00 → 08:00Z", () => {
    expect(salonInputToUtcIso("2026-07-07T11:00", MSK)).toBe(
      "2026-07-07T08:00:00.000Z",
    );
  });

  it("Vision (+5): an early salon-local time maps back across the UTC day boundary", () => {
    // 01:00 EKB − 5h = 20:00Z the PREVIOUS UTC day.
    expect(salonInputToUtcIso("2026-07-07T01:00", EKB)).toBe(
      "2026-07-06T20:00:00.000Z",
    );
  });

  it("returns null for empty / non-datetime input (never silently shift the booking)", () => {
    expect(salonInputToUtcIso("", EKB)).toBeNull();
    expect(salonInputToUtcIso("garbage", EKB)).toBeNull();
  });
});

describe("round-trip — no drift (the important guarantee)", () => {
  it("Vision (+5): UTC → salon-input → back to the SAME UTC instant", () => {
    const original = "2026-07-07T08:00:00.000Z";
    const input = utcIsoToSalonInput(original, EKB);
    expect(input).toBe("2026-07-07T13:00");
    // Admin does NOT edit — submit must land on the original instant.
    expect(salonInputToUtcIso(input, EKB)).toBe(original);
  });

  it("Vision (+5): an EDITED salon-local value resolves via the salon tz, not the browser tz", () => {
    // Admin opens a 13:00-EKB booking (08:00Z) and moves it to 14:30 EKB.
    const input = utcIsoToSalonInput("2026-07-07T08:00:00.000Z", EKB); // 13:00
    const edited = input.replace("T13:00", "T14:30");
    // 14:30 EKB = 09:30Z — computed in the SALON tz. A browser-tz reading of the
    // same wall-clock (e.g. a Moscow admin) would wrongly land on 11:30Z.
    expect(salonInputToUtcIso(edited, EKB)).toBe("2026-07-07T09:30:00.000Z");
  });

  it("Moscow control (+3): round-trip is stable too", () => {
    const original = "2026-07-07T15:45:00.000Z";
    const input = utcIsoToSalonInput(original, MSK); // 18:45 MSK
    expect(input).toBe("2026-07-07T18:45");
    expect(salonInputToUtcIso(input, MSK)).toBe(original);
  });

  it("cross-midnight round-trip is stable (date shifts both ways, instant preserved)", () => {
    const original = "2026-07-06T20:00:00.000Z";
    const input = utcIsoToSalonInput(original, EKB); // 2026-07-07T01:00
    expect(input).toBe("2026-07-07T01:00");
    expect(salonInputToUtcIso(input, EKB)).toBe(original);
  });
});

/**
 * TZ-DISPLAY-MANAGE-BREAKS-INPUT — the break dialog's default lunch time must be
 * the SALON's wall-clock hour, not the browser's, so a cross-tz admin doesn't
 * pre-fill (and then submit) a break shifted by their own tz.
 */
describe("salonLocalDatetimeInput — salon-local default datetime-local value", () => {
  it("Vision (+5): a 13:00 default is 13:00 SALON-local and submits to 08:00Z", () => {
    const day = "2026-07-07T00:00:00.000Z";
    const value = salonLocalDatetimeInput(day, 13, EKB);
    expect(value).toBe("2026-07-07T13:00");
    // Round-trip through the real submit path: 13:00 EKB → 08:00Z (NOT 10:00Z,
    // which is what a browser-tz Moscow admin would have produced).
    expect(salonInputToUtcIso(value, EKB)).toBe("2026-07-07T08:00:00.000Z");
  });

  it("uses the SALON-local calendar day even when the UTC instant is a different date", () => {
    // 20:00Z on the 6th is already 01:00 of the 7th in EKB (+5) → default on 7th.
    expect(salonLocalDatetimeInput("2026-07-06T20:00:00.000Z", 14, EKB)).toBe(
      "2026-07-07T14:00",
    );
  });

  it("Moscow control (+3): 14:00 default on the viewed day", () => {
    expect(salonLocalDatetimeInput("2026-07-07T00:00:00.000Z", 14, MSK)).toBe(
      "2026-07-07T14:00",
    );
  });

  it("pads a single-digit hour", () => {
    expect(salonLocalDatetimeInput("2026-07-07T00:00:00.000Z", 9, EKB)).toBe(
      "2026-07-07T09:00",
    );
  });

  it("returns '' for a malformed day (never a host-tz fallback)", () => {
    expect(salonLocalDatetimeInput("not-an-iso", 13, EKB)).toBe("");
  });
});
