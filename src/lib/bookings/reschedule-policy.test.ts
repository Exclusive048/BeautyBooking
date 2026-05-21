import { describe, it, expect } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  assertMasterPerformsService,
  assertWithinMasterWorkHours,
  type MasterWorkWindow,
} from "@/lib/bookings/policy-enforcement";

/**
 * STUDIO-RESCHEDULE-VALIDATION-A — pinning the two pure helpers that
 * gate studio reschedule:
 *   - `assertMasterPerformsService` — target master must have an
 *     enabled `MasterService` for the booking's service.
 *   - `assertWithinMasterWorkHours` — new local time must lie inside
 *     the target master's working window for that weekday (per-date
 *     override > weekly config > project defaults).
 *
 * The DB-aware shell in `studio/bookings.service.ts:moveStudioBooking`
 * fetches the rows once and feeds them into these helpers — keeping
 * the rule logic pure makes it cheap to cover boundaries exhaustively.
 */

describe("assertMasterPerformsService — #1а master ↔ service compatibility", () => {
  it("passes when master has an enabled service for every booking line", () => {
    expect(() =>
      assertMasterPerformsService({ hasEnabledMasterService: true }),
    ).not.toThrow();
  });

  it("throws MASTER_SERVICE_MISMATCH 422 when master doesn't perform it", () => {
    try {
      assertMasterPerformsService({ hasEnabledMasterService: false });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(422);
      expect(appErr.code).toBe("MASTER_SERVICE_MISMATCH");
      // Russian copy — surfaced verbatim in studio admin dialog
      expect(appErr.message).toContain("не выполняет");
    }
  });
});

describe("assertWithinMasterWorkHours — #1в work hours boundary", () => {
  const activeWindow: MasterWorkWindow = {
    isActive: true,
    startMinutes: 10 * 60, // 10:00
    endMinutes: 19 * 60, // 19:00
  };

  it("passes when booking starts at window opening (boundary inclusive)", () => {
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 10 * 60,
        bookingEndMinutes: 11 * 60,
        window: activeWindow,
      }),
    ).not.toThrow();
  });

  it("passes when booking ends at window closing (boundary inclusive)", () => {
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 18 * 60,
        bookingEndMinutes: 19 * 60,
        window: activeWindow,
      }),
    ).not.toThrow();
  });

  it("rejects 4 AM start (way before window) — the original #1в bug", () => {
    // User originally observed: moving a booking to 04:00 succeeded
    // silently. This is the exact regression test.
    try {
      assertWithinMasterWorkHours({
        bookingStartMinutes: 4 * 60,
        bookingEndMinutes: 5 * 60,
        window: activeWindow,
      });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(422);
      expect(appErr.code).toBe("OUTSIDE_WORK_HOURS");
    }
  });

  it("rejects booking ending after window closes", () => {
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 18 * 60 + 30,
        bookingEndMinutes: 19 * 60 + 30,
        window: activeWindow,
      }),
    ).toThrow(AppError);
  });

  it("rejects when window is inactive (day off)", () => {
    const dayOff: MasterWorkWindow = {
      isActive: false,
      startMinutes: null,
      endMinutes: null,
    };
    try {
      assertWithinMasterWorkHours({
        bookingStartMinutes: 11 * 60,
        bookingEndMinutes: 12 * 60,
        window: dayOff,
      });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe("OUTSIDE_WORK_HOURS");
      expect(appErr.message).toContain("не работает");
    }
  });

  it("rejects when minutes are null even if window says active (defensive)", () => {
    // The DB resolver may produce `isActive=true` but null minutes if a
    // ScheduleOverride row has no times configured (data anomaly).
    // The helper treats this as a day-off — fails closed.
    const corrupt: MasterWorkWindow = {
      isActive: true,
      startMinutes: null,
      endMinutes: null,
    };
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 12 * 60,
        bookingEndMinutes: 13 * 60,
        window: corrupt,
      }),
    ).toThrow(AppError);
  });

  it("rejects booking that starts inside but ends outside the window", () => {
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 18 * 60 + 45, // 18:45 — inside
        bookingEndMinutes: 19 * 60 + 45, // 19:45 — past close
        window: activeWindow,
      }),
    ).toThrow(AppError);
  });

  it("rejects booking that starts outside but ends inside the window", () => {
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 9 * 60 + 30, // 09:30 — before open
        bookingEndMinutes: 10 * 60 + 30, // 10:30 — inside
        window: activeWindow,
      }),
    ).toThrow(AppError);
  });
});

describe("STUDIO-RESCHEDULE-VALIDATION-A — error codes are distinct", () => {
  it("MASTER_SERVICE_MISMATCH and OUTSIDE_WORK_HOURS are independent", () => {
    // The two rules guard different concerns. A booking moved onto a
    // master who works the right hours but not the service should
    // produce MASTER_SERVICE_MISMATCH (not OUTSIDE_WORK_HOURS), and
    // vice versa. The shell in `moveStudioBooking` calls the
    // service-compatibility check first by design.
    try {
      assertMasterPerformsService({ hasEnabledMasterService: false });
    } catch (err) {
      expect((err as AppError).code).toBe("MASTER_SERVICE_MISMATCH");
    }
    try {
      assertWithinMasterWorkHours({
        bookingStartMinutes: 4 * 60,
        bookingEndMinutes: 5 * 60,
        window: { isActive: true, startMinutes: 10 * 60, endMinutes: 19 * 60 },
      });
    } catch (err) {
      expect((err as AppError).code).toBe("OUTSIDE_WORK_HOURS");
    }
  });
});
