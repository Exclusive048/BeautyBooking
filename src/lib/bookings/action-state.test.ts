import { describe, it, expect } from "vitest";
import {
  isBookingPastConfirmWindow,
  isBookingPastModifyWindow,
} from "@/lib/bookings/action-state";

/**
 * MASTER-DASHBOARD-FIX-A #3 — pinning the two action-window predicates
 * the dashboard / kanban / schedule menu use to decide when
 * confirm/decline/reschedule/cancel buttons disable.
 *
 * Both helpers wrap canonical `flow.ts` semantics
 * (`BOOKING_ACTION_WINDOW_MINUTES = 60` + `minutesUntilStart`). The
 * tests below assert behaviour at the boundaries that matter for the
 * UI gating: exact deadline, one minute on either side, null/legacy
 * inputs, and the dashboard's «start has passed» rule for confirm.
 */

const REF_NOW = new Date("2026-05-21T12:00:00.000Z");

const at = (minutesFromNow: number): Date =>
  new Date(REF_NOW.getTime() + minutesFromNow * 60_000);

describe("isBookingPastConfirmWindow (start has passed)", () => {
  it("returns false when start is in the future", () => {
    expect(isBookingPastConfirmWindow(at(120), REF_NOW)).toBe(false);
    expect(isBookingPastConfirmWindow(at(1), REF_NOW)).toBe(false);
  });

  it("returns true when start equals now (boundary)", () => {
    expect(isBookingPastConfirmWindow(at(0), REF_NOW)).toBe(true);
  });

  it("returns true when start is in the past", () => {
    expect(isBookingPastConfirmWindow(at(-1), REF_NOW)).toBe(true);
    expect(isBookingPastConfirmWindow(at(-180), REF_NOW)).toBe(true);
  });

  it("returns false for null / undefined startAtUtc (legacy slot-label-only)", () => {
    // Defensive: legacy bookings without UTC times aren't time-bound,
    // so the UI keeps the action available. The Prisma-level dashboard
    // filter already excludes these via `startAtUtc: { gt: now }`.
    expect(isBookingPastConfirmWindow(null, REF_NOW)).toBe(false);
    expect(isBookingPastConfirmWindow(undefined, REF_NOW)).toBe(false);
  });

  it("uses Date.now() default when `now` arg is omitted", () => {
    // Smoke check: a far-future date is never past the confirm window.
    const farFuture = new Date(Date.now() + 24 * 60 * 60_000);
    expect(isBookingPastConfirmWindow(farFuture)).toBe(false);
    const farPast = new Date(Date.now() - 60_000);
    expect(isBookingPastConfirmWindow(farPast)).toBe(true);
  });
});

describe("isBookingPastModifyWindow (60-min cancel/reschedule rule)", () => {
  it("returns false when more than 60 minutes remain", () => {
    expect(isBookingPastModifyWindow(at(61), REF_NOW)).toBe(false);
    expect(isBookingPastModifyWindow(at(120), REF_NOW)).toBe(false);
  });

  it("returns true at exactly 60 minutes (boundary mirrors backend)", () => {
    // `ensureBookingActionWindow` throws when `minutesLeft < 60`. At
    // exactly 60 the backend ALLOWS, so the helper should return
    // false. The off-by-one matters — we must not over-disable.
    expect(isBookingPastModifyWindow(at(60), REF_NOW)).toBe(false);
  });

  it("returns true when 59 minutes remain (just past the deadline)", () => {
    expect(isBookingPastModifyWindow(at(59), REF_NOW)).toBe(true);
  });

  it("returns true when the booking has already started", () => {
    expect(isBookingPastModifyWindow(at(0), REF_NOW)).toBe(true);
    expect(isBookingPastModifyWindow(at(-30), REF_NOW)).toBe(true);
  });

  it("returns false for null / undefined startAtUtc", () => {
    expect(isBookingPastModifyWindow(null, REF_NOW)).toBe(false);
    expect(isBookingPastModifyWindow(undefined, REF_NOW)).toBe(false);
  });

  it("returns false for invalid Date (NaN)", () => {
    // `minutesUntilStart` returns null for invalid input; treat as
    // not-actionable defensively (don't aggressively disable based
    // on garbage data).
    expect(isBookingPastModifyWindow(new Date("not-a-date"), REF_NOW)).toBe(false);
  });
});

describe("action-state predicates — mutual relationship", () => {
  it("confirm window outlasts modify window (always)", () => {
    // For any non-null start that is in the future but inside the
    // 60-min danger zone, modify is blocked but confirm is still
    // allowed. Captures the design intent: two windows, modify is
    // tighter.
    const cases = [at(1), at(15), at(30), at(45), at(59)];
    for (const start of cases) {
      expect(isBookingPastModifyWindow(start, REF_NOW)).toBe(true);
      expect(isBookingPastConfirmWindow(start, REF_NOW)).toBe(false);
    }
  });

  it("once start passes, both windows are expired", () => {
    const cases = [at(0), at(-1), at(-60), at(-1440)];
    for (const start of cases) {
      expect(isBookingPastModifyWindow(start, REF_NOW)).toBe(true);
      expect(isBookingPastConfirmWindow(start, REF_NOW)).toBe(true);
    }
  });
});
