import { describe, it, expect } from "vitest";
import type { BookingStatus } from "@prisma/client";
import {
  BOOKING_ACTION_WINDOW_MINUTES,
  BOOKING_FINISH_GRACE_MINUTES,
  canCancelBookingStatus,
  canCancelIndividually,
  ensureBookingActionWindow,
  ensureCancellationDeadline,
  minutesUntilStart,
  normalizeBookingStatus,
  resolveBookingRuntimeStatus,
} from "@/lib/bookings/flow";
import { AppError } from "@/lib/api/errors";

describe("bookings/flow — normalizeBookingStatus", () => {
  const mappings: ReadonlyArray<[BookingStatus, string]> = [
    ["NEW", "PENDING"],
    ["PENDING", "PENDING"],
    ["CONFIRMED", "CONFIRMED"],
    ["CHANGE_REQUESTED", "CHANGE_REQUESTED"],
    ["REJECTED", "REJECTED"],
    ["PREPAID", "CONFIRMED"],
    ["IN_PROGRESS", "IN_PROGRESS"],
    ["STARTED", "IN_PROGRESS"],
    ["FINISHED", "FINISHED"],
    ["CANCELLED", "REJECTED"],
    ["NO_SHOW", "REJECTED"],
  ];

  it.each(mappings)("normalizes %s → %s", (raw, expected) => {
    expect(normalizeBookingStatus(raw)).toBe(expected);
  });
});

describe("bookings/flow — resolveBookingRuntimeStatus", () => {
  const now = new Date("2026-05-18T12:00:00.000Z");

  it("returns REJECTED unchanged regardless of time", () => {
    expect(
      resolveBookingRuntimeStatus({
        status: "CANCELLED",
        startAtUtc: new Date("2026-05-18T08:00:00.000Z"),
        endAtUtc: new Date("2026-05-18T09:00:00.000Z"),
        now,
      }),
    ).toBe("REJECTED");
  });

  it("returns FINISHED unchanged when DB status is FINISHED", () => {
    expect(
      resolveBookingRuntimeStatus({
        status: "FINISHED",
        startAtUtc: new Date("2026-05-19T12:00:00.000Z"),
        endAtUtc: new Date("2026-05-19T13:00:00.000Z"),
        now,
      }),
    ).toBe("FINISHED");
  });

  it("returns normalized status when start is in the future", () => {
    expect(
      resolveBookingRuntimeStatus({
        status: "CONFIRMED",
        startAtUtc: new Date("2026-05-18T14:00:00.000Z"),
        endAtUtc: new Date("2026-05-18T15:00:00.000Z"),
        now,
      }),
    ).toBe("CONFIRMED");
  });

  it("promotes to IN_PROGRESS when now is between start and finish-grace", () => {
    expect(
      resolveBookingRuntimeStatus({
        status: "CONFIRMED",
        startAtUtc: new Date("2026-05-18T11:30:00.000Z"),
        endAtUtc: new Date("2026-05-18T12:30:00.000Z"),
        now,
      }),
    ).toBe("IN_PROGRESS");
  });

  it("promotes to FINISHED after duration + grace minutes", () => {
    // start 10:00, end 11:00 → duration 60min + grace 60min → finished at 12:00
    expect(
      resolveBookingRuntimeStatus({
        status: "CONFIRMED",
        startAtUtc: new Date("2026-05-18T10:00:00.000Z"),
        endAtUtc: new Date("2026-05-18T11:00:00.000Z"),
        now,
      }),
    ).toBe("FINISHED");
  });

  it("falls back to normalized when startAtUtc is null", () => {
    expect(
      resolveBookingRuntimeStatus({
        status: "PENDING",
        startAtUtc: null,
        endAtUtc: null,
        now,
      }),
    ).toBe("PENDING");
  });

  it("zero/negative duration only fires IN_PROGRESS via grace window", () => {
    // Duration 0 (start == end) → finished at start + 60min grace
    const startEq = new Date("2026-05-18T11:50:00.000Z");
    expect(
      resolveBookingRuntimeStatus({
        status: "CONFIRMED",
        startAtUtc: startEq,
        endAtUtc: startEq,
        now,
      }),
    ).toBe("IN_PROGRESS"); // 10 min after start, still in 60min grace
  });

  it("uses BOOKING_FINISH_GRACE_MINUTES of 60", () => {
    expect(BOOKING_FINISH_GRACE_MINUTES).toBe(60);
  });
});

describe("bookings/flow — minutesUntilStart", () => {
  it("returns null when startAtUtc is null", () => {
    expect(minutesUntilStart(null)).toBeNull();
  });

  it("returns positive minutes for future start", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");
    const start = new Date("2026-05-18T13:30:00.000Z");
    expect(minutesUntilStart(start, now)).toBe(90);
  });

  it("returns negative minutes for past start", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");
    const start = new Date("2026-05-18T11:30:00.000Z");
    expect(minutesUntilStart(start, now)).toBe(-30);
  });

  it("floors fractional minutes", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");
    const start = new Date("2026-05-18T12:00:30.000Z"); // 30s = 0.5 min
    expect(minutesUntilStart(start, now)).toBe(0);
  });
});

describe("bookings/flow — ensureBookingActionWindow (60-min rule)", () => {
  const now = new Date("2026-05-18T12:00:00.000Z");

  it("uses 60-minute window constant", () => {
    expect(BOOKING_ACTION_WINDOW_MINUTES).toBe(60);
  });

  it("throws BOOKING_TIME_REQUIRED when start is null", () => {
    try {
      ensureBookingActionWindow(null, now);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("BOOKING_TIME_REQUIRED");
    }
  });

  it("throws CONFLICT when less than 60 min remain", () => {
    const start = new Date("2026-05-18T12:30:00.000Z"); // 30 min away
    try {
      ensureBookingActionWindow(start, now);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CONFLICT");
      expect((err as AppError).status).toBe(409);
    }
  });

  it("throws CONFLICT when start is in the past", () => {
    const start = new Date("2026-05-18T11:00:00.000Z");
    expect(() => ensureBookingActionWindow(start, now)).toThrow(AppError);
  });

  it("passes when exactly 60 minutes remain", () => {
    const start = new Date("2026-05-18T13:00:00.000Z");
    expect(() => ensureBookingActionWindow(start, now)).not.toThrow();
  });

  it("passes when more than 60 minutes remain", () => {
    const start = new Date("2026-05-18T15:00:00.000Z");
    expect(() => ensureBookingActionWindow(start, now)).not.toThrow();
  });
});

describe("bookings/flow — ensureCancellationDeadline", () => {
  const now = new Date("2026-05-18T12:00:00.000Z");

  it("is no-op when deadlineHours is null/undefined", () => {
    expect(() => ensureCancellationDeadline(null, null, now)).not.toThrow();
    expect(() =>
      ensureCancellationDeadline(new Date("2026-05-18T20:00:00.000Z"), undefined, now),
    ).not.toThrow();
  });

  it("throws BOOKING_TIME_REQUIRED when deadline set but startAt missing", () => {
    try {
      ensureCancellationDeadline(null, 24, now);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as AppError).code).toBe("BOOKING_TIME_REQUIRED");
    }
  });

  it("throws CANCELLATION_DEADLINE_PASSED (423) when deadlineHours ≤ 0", () => {
    const start = new Date("2026-05-19T12:00:00.000Z");
    try {
      ensureCancellationDeadline(start, 0, now);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as AppError).status).toBe(423);
      expect((err as AppError).code).toBe("CANCELLATION_DEADLINE_PASSED");
    }
  });

  it("throws when now is past the deadline window", () => {
    // start = now + 23h; deadlineHours=24 → deadline already 1h ago
    const start = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    try {
      ensureCancellationDeadline(start, 24, now);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as AppError).code).toBe("CANCELLATION_DEADLINE_PASSED");
    }
  });

  it("passes when comfortably before deadline", () => {
    const start = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h away
    expect(() => ensureCancellationDeadline(start, 24, now)).not.toThrow();
  });

  it("passes when exactly at the deadline boundary (inclusive)", () => {
    // start = now + 24h, deadline=24h → deadlineMs == now → not strictly greater than
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(() => ensureCancellationDeadline(start, 24, now)).not.toThrow();
  });
});

describe("bookings/flow — canCancelBookingStatus", () => {
  it("allows PENDING (raw + NEW)", () => {
    expect(canCancelBookingStatus("PENDING")).toBe(true);
    expect(canCancelBookingStatus("NEW")).toBe(true);
  });

  it("allows CONFIRMED (raw + PREPAID)", () => {
    expect(canCancelBookingStatus("CONFIRMED")).toBe(true);
    expect(canCancelBookingStatus("PREPAID")).toBe(true);
  });

  it("blocks terminal/in-progress states", () => {
    expect(canCancelBookingStatus("FINISHED")).toBe(false);
    expect(canCancelBookingStatus("CANCELLED")).toBe(false);
    expect(canCancelBookingStatus("REJECTED")).toBe(false);
    expect(canCancelBookingStatus("NO_SHOW")).toBe(false);
    expect(canCancelBookingStatus("IN_PROGRESS")).toBe(false);
    expect(canCancelBookingStatus("STARTED")).toBe(false);
  });

  // CANCEL-DURING-RESCHEDULE: согласуемый перенос не запирает запись — отменить
  // её можно, не дожидаясь ответа второй стороны.
  it("allows CHANGE_REQUESTED (pending reschedule does not lock the booking)", () => {
    expect(canCancelBookingStatus("CHANGE_REQUESTED")).toBe(true);
  });

  it("agrees with canCancelIndividually on every status (one criterion, LOGIC-13)", () => {
    const statuses: BookingStatus[] = [
      "NEW",
      "PENDING",
      "CONFIRMED",
      "PREPAID",
      "CHANGE_REQUESTED",
      "STARTED",
      "IN_PROGRESS",
      "FINISHED",
      "CANCELLED",
      "REJECTED",
      "NO_SHOW",
    ];
    for (const status of statuses) {
      expect(canCancelBookingStatus(status)).toBe(
        canCancelIndividually({
          status: normalizeBookingStatus(status),
          bookingPackageId: null,
        }),
      );
    }
  });
});
