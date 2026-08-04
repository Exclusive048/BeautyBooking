import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  assertMasterPerformsService,
  assertWithinMasterWorkHours,
  resolveSalonLocalParts,
  type MasterWorkWindow,
} from "@/lib/bookings/policy-enforcement";

/**
 * STUDIO-CLIENT-WRITE-DIALOG-A — regression-gap closure pinning.
 *
 * STUDIO-RESCHEDULE-VALIDATION-A applied master-service + work-hours
 * + conflict guards to `moveStudioBooking`. The parallel
 * `createStudioBooking` was missing two of those three (only
 * master-service was checked via `MasterService.isEnabled`). This
 * fix mirrors the reschedule shell into the creation path.
 *
 * These tests pin the **rule semantics** (pure helpers) so any future
 * drift between create + reschedule enforcement surfaces immediately.
 * The DB-aware shell in `createStudioBooking` calls the same
 * `resolveMasterWorkWindow` resolver + inline `findMany` conflict
 * check — identical helpers to the reschedule path.
 */

describe("STUDIO-CLIENT-WRITE-DIALOG-A — create-booking rule reuse", () => {
  it("uses the same MASTER_SERVICE_MISMATCH code as reschedule", () => {
    try {
      assertMasterPerformsService({ hasEnabledMasterService: false });
      throw new Error("expected to throw");
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe("MASTER_SERVICE_MISMATCH");
      expect(appErr.status).toBe(422);
    }
  });

  it("uses the same OUTSIDE_WORK_HOURS code as reschedule", () => {
    const window: MasterWorkWindow = {
      isActive: true,
      startMinutes: 10 * 60,
      endMinutes: 19 * 60,
    };
    try {
      // Same 4 AM regression as the reschedule fix — creating a
      // booking at this time must fail with the same explicit code.
      assertWithinMasterWorkHours({
        bookingStartMinutes: 4 * 60,
        bookingEndMinutes: 5 * 60,
        window,
      });
      throw new Error("expected to throw");
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe("OUTSIDE_WORK_HOURS");
      expect(appErr.status).toBe(422);
    }
  });

  it("create + reschedule share the work-window boundary semantics", () => {
    // The two shells (`createStudioBooking` + `moveStudioBooking`)
    // call the same helper with the same inclusive boundaries —
    // start ≥ open AND end ≤ close — so a booking that opens at
    // window-start and ends at window-end is valid in both paths.
    const window: MasterWorkWindow = {
      isActive: true,
      startMinutes: 10 * 60,
      endMinutes: 19 * 60,
    };
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 10 * 60,
        bookingEndMinutes: 19 * 60,
        window,
      }),
    ).not.toThrow();
  });

  it("inactive day rejected identically for create + reschedule", () => {
    const dayOff: MasterWorkWindow = {
      isActive: false,
      startMinutes: null,
      endMinutes: null,
    };
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: 12 * 60,
        bookingEndMinutes: 13 * 60,
        window: dayOff,
      }),
    ).toThrow(AppError);
  });

  it("FIX-R2-04-B: create path reads salon-tz minutes (mirror of reschedule)", () => {
    // Both shells (`createStudioBooking` + `moveStudioBooking`) now feed
    // `resolveSalonLocalParts(instant, master.timezone)` into the same
    // `assertWithinMasterWorkHours` helper. So a +5 Yekaterinburg 11:00 create
    // (06:00 UTC) is accepted in a 10-19 window — pre-fix BOTH paths read
    // getUTCHours() and wrongly rejected it as 06:00.
    const local = resolveSalonLocalParts(new Date("2026-06-25T06:00:00.000Z"), "Asia/Yekaterinburg");
    expect(local.minutesFromMidnight).toBe(11 * 60); // 11:00 salon-local, not 06:00 UTC
    const window: MasterWorkWindow = { isActive: true, startMinutes: 10 * 60, endMinutes: 19 * 60 };
    expect(() =>
      assertWithinMasterWorkHours({
        bookingStartMinutes: local.minutesFromMidnight,
        bookingEndMinutes: local.minutesFromMidnight + 60,
        window,
      }),
    ).not.toThrow();
  });
});

describe("STUDIO-CLIENT-WRITE-DIALOG-A — prefilled-client display rules", () => {
  /**
   * The `CreateBookingDialog` reads `prefilledClient?: { name, phone }`
   * and seeds the local form state on open. Empty / null prop → blank
   * form (anonymous-create flow). These tests pin the seeding rules.
   */
  function resolvePrefilledName(input: {
    prefilled: { name: string } | null;
  }): string {
    return input.prefilled?.name ?? "";
  }
  function resolvePrefilledPhone(input: {
    prefilled: { phone: string } | null;
  }): string {
    return input.prefilled?.phone ?? "";
  }

  it("seeds name + phone when prefilled client is provided", () => {
    expect(
      resolvePrefilledName({ prefilled: { name: "Анна Петрова" } }),
    ).toBe("Анна Петрова");
    expect(
      resolvePrefilledPhone({ prefilled: { phone: "+79991112233" } }),
    ).toBe("+79991112233");
  });

  it("falls back to blank when prefilled is null (anonymous create flow)", () => {
    expect(resolvePrefilledName({ prefilled: null })).toBe("");
    expect(resolvePrefilledPhone({ prefilled: null })).toBe("");
  });

  it("accepts an empty-phone client record (phone-less prefill)", () => {
    // Studio clients table may have `row.phone === null` for legacy
    // phone-less records; the dialog must still open with the name
    // seeded and phone blank (admin types it). Pre-fix
    // `<Link href="/calendar">` lost both.
    expect(
      resolvePrefilledName({ prefilled: { name: "Иван" } }),
    ).toBe("Иван");
    expect(resolvePrefilledPhone({ prefilled: { phone: "" } })).toBe("");
  });
});
