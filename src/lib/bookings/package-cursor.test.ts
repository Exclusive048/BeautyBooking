import { describe, expect, it } from "vitest";
import {
  nextComponentEarliestStart,
  studioNextComponentEarliestStart,
} from "@/lib/bookings/package-cursor";
import {
  intraPackageOverlap,
  intraPackageOverlapMultiMaster,
  type PackageComponentSlot,
} from "@/lib/bookings/package-math";

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

/**
 * PACKAGE-STUDIO-SAME-MASTER-BUFFER — the studio wizard's cursor pinned to
 * `intraPackageOverlapMultiMaster`'s real acceptance boundary, mirroring the
 * solo pin above. The guard's buffer is CONDITIONAL: the master's own buffer
 * between same-master components, zero between different masters — so must be
 * the cursor: too small re-creates the 409-at-review this fix removes; too
 * large hides valid back-to-back different-master slots.
 */
describe("studioNextComponentEarliestStart", () => {
  const MASTER_A = "master-a";
  const MASTER_B = "master-b";

  const component = (
    masterProviderId: string,
    startAtUtc: Date,
    durationMin: number,
    bufferMin: number,
  ): PackageComponentSlot => ({
    masterProviderId,
    bufferMin,
    startAtUtc,
    endAtUtc: new Date(startAtUtc.getTime() + durationMin * 60_000),
  });

  it.each([5, 10, 15, 30])(
    "same master: the cursor is exactly the earliest start the create accepts (buffer=%i)",
    (bufferMin) => {
      const first = component(MASTER_A, PREV_START, 60, bufferMin);
      const cursor = studioNextComponentEarliestStart({
        prevEndAtUtc: first.endAtUtc,
        placed: [{ masterProviderId: MASTER_A, endAtUtc: first.endAtUtc }],
        masterProviderId: MASTER_A,
        masterBufferMin: bufferMin,
      });

      // The buffer is a real gap after the previous component…
      expect(cursor.getTime()).toBe(first.endAtUtc.getTime() + bufferMin * 60_000);
      // …at the cursor → accepted (the first slot the wizard now offers).
      expect(
        intraPackageOverlapMultiMaster([first, component(MASTER_A, cursor, 30, bufferMin)]),
      ).toBe(false);
      // One minute earlier → rejected. The old flat-prevEnd cursor offered
      // exactly this class of slot and 409'd at review.
      const tooEarly = new Date(cursor.getTime() - 60_000);
      expect(
        intraPackageOverlapMultiMaster([first, component(MASTER_A, tooEarly, 30, bufferMin)]),
      ).toBe(true);
    },
  );

  it("same master back-to-back is what the create rejects — the pre-fix offered slot", () => {
    const first = component(MASTER_A, PREV_START, 60, 15);
    // prevEnd (the old cursor) → guard trips.
    expect(
      intraPackageOverlapMultiMaster([first, component(MASTER_A, first.endAtUtc, 30, 15)]),
    ).toBe(true);
  });

  it("different master: no spurious gap — back-to-back stays offered and stays valid", () => {
    const first = component(MASTER_A, PREV_START, 60, 15);
    const cursor = studioNextComponentEarliestStart({
      prevEndAtUtc: first.endAtUtc,
      placed: [{ masterProviderId: MASTER_A, endAtUtc: first.endAtUtc }],
      masterProviderId: MASTER_B,
      masterBufferMin: 15, // B's own buffer must NOT apply across masters
    });

    expect(cursor.getTime()).toBe(first.endAtUtc.getTime());
    expect(
      intraPackageOverlapMultiMaster([first, component(MASTER_B, cursor, 30, 15)]),
    ).toBe(false);
  });

  it("A-B-A: the non-adjacent same-master pair still constrains the cursor", () => {
    // A (60 min, buffer 30) → B (15 min, back-to-back) → A again. The
    // adjacent prevEnd is B's end (A.end + 15 min), but the (A, A) pair
    // needs A.end + 30 — the cursor must honour the LATER constraint.
    const bufferA = 30;
    const first = component(MASTER_A, PREV_START, 60, bufferA);
    const second = component(MASTER_B, first.endAtUtc, 15, 15);
    const cursor = studioNextComponentEarliestStart({
      prevEndAtUtc: second.endAtUtc,
      placed: [
        { masterProviderId: MASTER_A, endAtUtc: first.endAtUtc },
        { masterProviderId: MASTER_B, endAtUtc: second.endAtUtc },
      ],
      masterProviderId: MASTER_A,
      masterBufferMin: bufferA,
    });

    expect(cursor.toISOString()).toBe(
      nextComponentEarliestStart(first.endAtUtc, bufferA).toISOString(),
    );
    expect(
      intraPackageOverlapMultiMaster([
        first,
        second,
        component(MASTER_A, cursor, 30, bufferA),
      ]),
    ).toBe(false);
    // At B's end (the naive adjacent cursor) the (A, A) pair still trips.
    expect(
      intraPackageOverlapMultiMaster([
        first,
        second,
        component(MASTER_A, second.endAtUtc, 30, bufferA),
      ]),
    ).toBe(true);
  });

  it("zero buffer keeps same-master back-to-back valid (cursor = prevEnd)", () => {
    const first = component(MASTER_A, PREV_START, 60, 0);
    const cursor = studioNextComponentEarliestStart({
      prevEndAtUtc: first.endAtUtc,
      placed: [{ masterProviderId: MASTER_A, endAtUtc: first.endAtUtc }],
      masterProviderId: MASTER_A,
      masterBufferMin: 0,
    });
    expect(cursor.getTime()).toBe(first.endAtUtc.getTime());
    expect(
      intraPackageOverlapMultiMaster([first, component(MASTER_A, cursor, 30, 0)]),
    ).toBe(false);
  });
});
