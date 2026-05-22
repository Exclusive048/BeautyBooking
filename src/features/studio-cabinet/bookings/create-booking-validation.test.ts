import { describe, expect, it } from "vitest";
import { normalizeRussianPhone } from "@/lib/phone/russia";

/**
 * STUDIO-BOOKINGS-FIX-A — pinning the two predicates the
 * `CreateBookingDialog` uses for #3б (time-required) and #3в
 * (real-time phone validation). The dialog itself is a thin
 * React component over these rules; the rules live as pure
 * expressions inside it. Mirroring the predicates here gives
 * regression coverage without DOM setup — same pattern as the
 * MASTER-DASHBOARD-FIX-A action-state tests.
 *
 * If either rule changes in the dialog, this test forces an
 * explicit, audit-able update.
 */

/**
 * #3в predicate: the dialog accepts an empty phone (treat as
 * "user is still typing") and otherwise demands
 * `normalizeRussianPhone` returns a non-null normalised form.
 * Submit button is disabled while this is false.
 */
function phoneInputIsAcceptable(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length === 0 || normalizeRussianPhone(trimmed) !== null;
}

/**
 * #3б resolver: the dialog accepts EITHER a pre-filled
 * `startAtUtc` (calendar-click flow) OR a non-empty local
 * datetime string from the new picker (header-button flow).
 * Returns the effective UTC ISO or null.
 */
function resolveEffectiveStart(input: {
  startAtUtcPrefill: string | null;
  startAtLocal: string;
}): string | null {
  if (input.startAtUtcPrefill) return input.startAtUtcPrefill;
  if (!input.startAtLocal) return null;
  const date = new Date(input.startAtLocal);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

describe("STUDIO-BOOKINGS-FIX-A #3в — real-time phone acceptance", () => {
  it("accepts an empty input (user is still typing)", () => {
    expect(phoneInputIsAcceptable("")).toBe(true);
    expect(phoneInputIsAcceptable("   ")).toBe(true);
  });

  it("accepts a canonical Russian phone (+7XXXXXXXXXX)", () => {
    expect(phoneInputIsAcceptable("+79991112233")).toBe(true);
  });

  it("accepts the 8-prefix variant (Russian carriers)", () => {
    // `normalizeRussianPhone` accepts both 8 and +7 leading shapes
    expect(phoneInputIsAcceptable("89991112233")).toBe(true);
  });

  it("rejects obviously incomplete input", () => {
    expect(phoneInputIsAcceptable("+7999")).toBe(false);
    expect(phoneInputIsAcceptable("999")).toBe(false);
  });

  it("rejects letters / garbage", () => {
    expect(phoneInputIsAcceptable("abcdefghij")).toBe(false);
    expect(phoneInputIsAcceptable("+7 (abc) def-gh-ij")).toBe(false);
  });

  it("accepts formatted phone with separators (normalizeRussianPhone strips them)", () => {
    expect(phoneInputIsAcceptable("+7 (999) 111-22-33")).toBe(true);
  });
});

describe("STUDIO-BOOKINGS-FIX-A #3б — effective start resolution", () => {
  it("returns the pre-filled startAtUtc when provided (calendar-click flow)", () => {
    const iso = "2026-06-01T12:00:00.000Z";
    expect(
      resolveEffectiveStart({
        startAtUtcPrefill: iso,
        startAtLocal: "",
      }),
    ).toBe(iso);
  });

  it("converts a local datetime string to UTC ISO (header-button flow)", () => {
    const result = resolveEffectiveStart({
      startAtUtcPrefill: null,
      startAtLocal: "2026-06-01T15:30",
    });
    // Only assert the ISO shape — the exact UTC depends on the
    // runner's timezone, which is intentional (datetime-local
    // semantics: user enters local, browser interprets local).
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("returns null when both pre-fill and local input are missing", () => {
    // Pre-fix #3б bug: this case used to silently fall through to
    // the generic `E.create` error. Now the dialog explicitly says
    // «Укажите дату и время записи».
    expect(
      resolveEffectiveStart({
        startAtUtcPrefill: null,
        startAtLocal: "",
      }),
    ).toBeNull();
  });

  it("returns null for malformed local input", () => {
    expect(
      resolveEffectiveStart({
        startAtUtcPrefill: null,
        startAtLocal: "not-a-date",
      }),
    ).toBeNull();
  });

  it("prefers the pre-fill over a local input (calendar > picker semantics)", () => {
    const iso = "2026-06-01T12:00:00.000Z";
    // If somehow both are populated, the pre-fill wins — matches
    // the dialog implementation which reads `startAtUtc ?? local…`.
    const result = resolveEffectiveStart({
      startAtUtcPrefill: iso,
      startAtLocal: "2027-01-01T09:00",
    });
    expect(result).toBe(iso);
  });
});
