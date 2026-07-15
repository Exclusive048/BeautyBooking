import { describe, expect, it } from "vitest";
import { nextComponentEarliestStart } from "@/lib/bookings/package-cursor";
import { intraPackageOverlap } from "@/lib/bookings/package-math";

/**
 * PACKAGE-SOLO-WIZARD-01 — the crux invariant of the solo package wizard.
 *
 * The backend enforces non-overlap, NOT order: the widget's cursor is what
 * keeps a package sequential along the client's timeline. So the cursor must
 * agree with `intraPackageOverlap` (what `createSoloPackageBooking` actually
 * runs) at the exact boundary — one minute of drift either way is a real bug:
 * too small → the client picks a slot and gets a 409 after entering contacts;
 * too large → bookable slots silently disappear.
 *
 * These tests are the regression net the package flow otherwise lacks (only
 * `package-math.test.ts` existed, covering the pricing math).
 */

const PREV_START = new Date("2026-07-20T10:00:00.000Z");
const PREV_END = new Date("2026-07-20T11:00:00.000Z");
const NEXT_DURATION_MS = 30 * 60_000;

function placementWithNextStartingAt(start: Date) {
  return [
    { startAtUtc: PREV_START, endAtUtc: PREV_END },
    { startAtUtc: start, endAtUtc: new Date(start.getTime() + NEXT_DURATION_MS) },
  ];
}

describe("nextComponentEarliestStart", () => {
  it.each([0, 5, 10, 15, 30, 60])(
    "is exactly the earliest start createSoloPackageBooking accepts (buffer=%i)",
    (bufferMin) => {
      const earliest = nextComponentEarliestStart(PREV_END, bufferMin);

      // At the cursor → accepted (this is the first slot the wizard offers).
      expect(intraPackageOverlap(placementWithNextStartingAt(earliest), bufferMin)).toBe(false);

      // One minute before it → rejected. If this ever passes, the cursor is
      // hiding a slot the backend would have taken.
      const tooEarly = new Date(earliest.getTime() - 60_000);
      expect(intraPackageOverlap(placementWithNextStartingAt(tooEarly), bufferMin)).toBe(true);
    },
  );

  it("leaves the master's buffer as a real gap after the previous component", () => {
    expect(nextComponentEarliestStart(PREV_END, 15).toISOString()).toBe(
      "2026-07-20T11:15:00.000Z",
    );
  });

  it("allows back-to-back placement when the master keeps no buffer", () => {
    expect(nextComponentEarliestStart(PREV_END, 0).getTime()).toBe(PREV_END.getTime());
  });

  it("treats a negative or fractional buffer as the engine's normalization does", () => {
    expect(nextComponentEarliestStart(PREV_END, -30).getTime()).toBe(PREV_END.getTime());
    expect(nextComponentEarliestStart(PREV_END, 10.9).toISOString()).toBe(
      "2026-07-20T11:10:00.000Z",
    );
  });

  it("carries across a day boundary (components may span different days)", () => {
    const lateEnd = new Date("2026-07-20T23:50:00.000Z");
    expect(nextComponentEarliestStart(lateEnd, 15).toISOString()).toBe(
      "2026-07-21T00:05:00.000Z",
    );
  });
});
