import { describe, expect, it } from "vitest";
import { BookingStatus } from "@prisma/client";
import { classifyClientBookingGroup } from "./booking-classification";

/**
 * FIX-EXP-A11Y-PWA (EXP-013): the upcoming/past split must be DATETIME-aware
 * (via the canonical runtime-finished cutoff `resolveBookingRuntimeStatus`),
 * not status-only. An elapsed-but-not-FINISHED booking is history, not
 * "upcoming". Grace = BOOKING_FINISH_GRACE_MINUTES (60), so "elapsed" means
 * `start + duration + 60min ≤ now`.
 */
const NOW = new Date("2026-07-04T12:00:00.000Z");
const hour = (iso: string) => new Date(iso);

describe("classifyClientBookingGroup (EXP-013 datetime split)", () => {
  it("future CONFIRMED → upcoming", () => {
    expect(
      classifyClientBookingGroup({
        status: BookingStatus.CONFIRMED,
        startAtUtc: hour("2026-07-04T15:00:00Z"),
        endAtUtc: hour("2026-07-04T16:00:00Z"),
        now: NOW,
      }),
    ).toBe("upcoming");
  });

  it("elapsed CONFIRMED (end + grace already past) → finished — THE BUG FIX", () => {
    // end 09:00 + 60min grace = 10:00, < 12:00 now → runtime-FINISHED
    expect(
      classifyClientBookingGroup({
        status: BookingStatus.CONFIRMED,
        startAtUtc: hour("2026-07-04T08:00:00Z"),
        endAtUtc: hour("2026-07-04T09:00:00Z"),
        now: NOW,
      }),
    ).toBe("finished");
  });

  it("elapsed PENDING → finished (not 'upcoming' just because status is PENDING)", () => {
    expect(
      classifyClientBookingGroup({
        status: BookingStatus.PENDING,
        startAtUtc: hour("2026-07-04T08:00:00Z"),
        endAtUtc: hour("2026-07-04T09:00:00Z"),
        now: NOW,
      }),
    ).toBe("finished");
  });

  it("in-progress (now between start and finishedAt) → upcoming/active", () => {
    // start 11:30, end 12:30 → finishedAt 13:30; now 12:00 is in-progress, not elapsed
    expect(
      classifyClientBookingGroup({
        status: BookingStatus.CONFIRMED,
        startAtUtc: hour("2026-07-04T11:30:00Z"),
        endAtUtc: hour("2026-07-04T12:30:00Z"),
        now: NOW,
      }),
    ).toBe("upcoming");
  });

  it("grace boundary: now exactly at finishedAt → finished", () => {
    // end 11:00 + 60min grace = 12:00 = now
    expect(
      classifyClientBookingGroup({
        status: BookingStatus.CONFIRMED,
        startAtUtc: hour("2026-07-04T10:00:00Z"),
        endAtUtc: hour("2026-07-04T11:00:00Z"),
        now: NOW,
      }),
    ).toBe("finished");
  });

  it("persisted FINISHED → finished regardless of time", () => {
    expect(
      classifyClientBookingGroup({
        status: BookingStatus.FINISHED,
        startAtUtc: hour("2026-07-04T15:00:00Z"),
        endAtUtc: hour("2026-07-04T16:00:00Z"),
        now: NOW,
      }),
    ).toBe("finished");
  });

  it("CANCELLED / REJECTED / NO_SHOW → cancelled (even if time is future)", () => {
    for (const status of [
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED,
      BookingStatus.NO_SHOW,
    ]) {
      expect(
        classifyClientBookingGroup({
          status,
          startAtUtc: hour("2026-07-04T15:00:00Z"),
          endAtUtc: hour("2026-07-04T16:00:00Z"),
          now: NOW,
        }),
      ).toBe("cancelled");
    }
  });

  it("null startAtUtc (legacy slot-label) CONFIRMED → upcoming (can't be elapsed)", () => {
    expect(
      classifyClientBookingGroup({
        status: BookingStatus.CONFIRMED,
        startAtUtc: null,
        endAtUtc: null,
        now: NOW,
      }),
    ).toBe("upcoming");
  });
});
