import { describe, it, expect } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  assertMasterPerformsService,
  assertWithinMasterWorkHours,
  resolveSalonLocalParts,
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

describe("FIX-R2-04-B — resolveSalonLocalParts (salon-tz work-hours derivation)", () => {
  // Asia/Almaty is UTC+5 (no DST). The studio work-hours guard
  // (`createStudioBooking` + `moveStudioBooking`) must read the real-UTC
  // booking instant in the SALON timezone, NOT via getUTCHours() /
  // getUTCDay() — which is the salon's UTC offset off the salon-local
  // window. Each test contrasts the salon-local value with the old
  // UTC-derived defect.
  const ALMATY = "Asia/Almaty";

  it("reads 06:00 UTC as 11:00 Almaty (660 min), not 06:00 (360 min)", () => {
    // The in-hours-wrongly-rejected case: 11:00 Almaty is inside a 10-19
    // window; pre-fix getUTCHours gave 360 (< 600) → wrongly rejected.
    const parts = resolveSalonLocalParts(new Date("2026-06-25T06:00:00.000Z"), ALMATY);
    expect(parts.minutesFromMidnight).toBe(11 * 60); // 660 salon-local
    expect(parts.minutesFromMidnight).not.toBe(6 * 60); // not 360 (raw UTC)
  });

  it("reads 15:00 UTC as 20:00 Almaty (1200 min), not 15:00 (900 min)", () => {
    // The out-of-hours-wrongly-allowed case: 20:00 Almaty is past a 10-19
    // close; pre-fix getUTCHours gave 900 (inside [600,1140]) → wrongly allowed.
    const parts = resolveSalonLocalParts(new Date("2026-06-25T15:00:00.000Z"), ALMATY);
    expect(parts.minutesFromMidnight).toBe(20 * 60); // 1200 salon-local
    expect(parts.minutesFromMidnight).not.toBe(15 * 60); // not 900 (raw UTC)
  });

  it("reads window-open boundary 05:00 UTC as 10:00 Almaty (600 min)", () => {
    const parts = resolveSalonLocalParts(new Date("2026-06-25T05:00:00.000Z"), ALMATY);
    expect(parts.minutesFromMidnight).toBe(10 * 60); // exactly window open
  });

  it("resolves weekday + dateKey in salon tz for a cross-midnight instant", () => {
    // 2026-06-28 21:00 UTC = Monday 2026-06-29 02:00 Almaty. Pre-fix
    // getUTCDay gave 0 (Sun) + UTC dateKey 2026-06-28 → looked up the wrong
    // weekly day AND the wrong ScheduleOverride row. Salon-local gives
    // Monday (1) + 2026-06-29.
    const parts = resolveSalonLocalParts(new Date("2026-06-28T21:00:00.000Z"), ALMATY);
    expect(parts.weekday).toBe(1); // Monday salon-local — UTC getUTCDay() = 0 (Sun)
    expect(parts.dateKey).toBe("2026-06-29"); // UTC-derived would give 2026-06-28
    expect(parts.minutesFromMidnight).toBe(2 * 60); // 02:00 local
  });

  it("Europe/Moscow (+3): 08:00 UTC reads as 11:00 MSK (660 min)", () => {
    const parts = resolveSalonLocalParts(new Date("2026-06-25T08:00:00.000Z"), "Europe/Moscow");
    expect(parts.minutesFromMidnight).toBe(11 * 60);
  });

  it("integration: salon-local minutes ACCEPT an in-hours time UTC wrongly rejected", () => {
    // 10-19 Almaty window. 11:00 Almaty (06:00 UTC) is IN hours.
    const window: MasterWorkWindow = { isActive: true, startMinutes: 10 * 60, endMinutes: 19 * 60 };
    const instant = new Date("2026-06-25T06:00:00.000Z"); // 11:00 Almaty
    const local = resolveSalonLocalParts(instant, ALMATY);

    // Salon-tz minutes → PASSES (correct, post-fix).
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: local.minutesFromMidnight,
        bookingEndMinutes: local.minutesFromMidnight + 60,
        window,
      }),
    ).not.toThrow();

    // UTC-derived minutes (the old defect) → THROWS (wrongly rejected).
    const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes(); // 360
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: utcMinutes,
        bookingEndMinutes: utcMinutes + 60,
        window,
      }),
    ).toThrow(AppError);
  });

  it("integration: salon-local minutes BLOCK an out-of-hours time UTC wrongly allowed", () => {
    // 20:00 Almaty (15:00 UTC) is OUT of a 10-19 window.
    const window: MasterWorkWindow = { isActive: true, startMinutes: 10 * 60, endMinutes: 19 * 60 };
    const instant = new Date("2026-06-25T15:00:00.000Z"); // 20:00 Almaty
    const local = resolveSalonLocalParts(instant, ALMATY);

    // Salon-tz minutes → THROWS (correct, post-fix blocks out-of-hours).
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: local.minutesFromMidnight,
        bookingEndMinutes: local.minutesFromMidnight + 60,
        window,
      }),
    ).toThrow(AppError);

    // UTC-derived minutes (the old defect) → PASSES (wrongly allowed).
    const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes(); // 900
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: utcMinutes,
        bookingEndMinutes: utcMinutes + 60,
        window,
      }),
    ).not.toThrow();
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
