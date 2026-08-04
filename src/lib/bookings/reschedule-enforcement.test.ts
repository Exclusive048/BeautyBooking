import { describe, it, expect, beforeEach, vi } from "vitest";
import { BookingStatus } from "@prisma/client";

/**
 * MASTER-RESCHEDULE-FIX-A — reschedule policy enforcement.
 *
 * `rescheduleBooking` (the function that powers BOTH master-side and
 * client-side reschedule) must apply the provider's
 * `minBookingHoursAhead` / `maxBookingDaysAhead` policy to the NEW
 * proposed time. This mirrors what `createBooking` does for the
 * initial booking (BOOKING-WIDGET-A invariant).
 *
 * We assert the failure modes only — the existing flow tests
 * (`flow.test.ts`) already cover the boundary math via the shared
 * `policy-enforcement.ts` helpers. Here we just prove the helper is
 * actually invoked from the reschedule path.
 */

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const invalidateSlotsForBookingMove = vi.hoisted(() => vi.fn(async () => undefined));
const ensureNoConflictsExcluding = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true as const })),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique, update, findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/bookings/slot-invalidation", () => ({
  invalidateSlotsForBookingMove,
}));

import { rescheduleBooking } from "@/lib/bookings/usecases";

const baseBooking: {
  id: string;
  status: BookingStatus;
  providerId: string;
  masterProviderId: string;
  clientUserId: string;
  startAtUtc: Date;
  endAtUtc: Date;
  clientChangeRequestsCount: number;
  masterChangeRequestsCount: number;
  provider: { minBookingHoursAhead: number; maxBookingDaysAhead: number };
} = {
  id: "b1",
  status: BookingStatus.CONFIRMED,
  providerId: "provider-1",
  masterProviderId: "provider-1",
  clientUserId: "client-1",
  // Original start far enough in future to pass the 60-min cancel
  // window (it's only used as the cancel-window anchor; the NEW time
  // is what assertBookingWindow validates).
  startAtUtc: new Date(Date.now() + 48 * 60 * 60 * 1000),
  endAtUtc: new Date(Date.now() + 49 * 60 * 60 * 1000),
  clientChangeRequestsCount: 0,
  masterChangeRequestsCount: 0,
  provider: {
    minBookingHoursAhead: 2,
    maxBookingDaysAhead: 30,
  },
};

function setupBooking(overrides: Partial<typeof baseBooking> = {}) {
  findUnique.mockResolvedValueOnce({ ...baseBooking, ...overrides });
}

describe("rescheduleBooking — policy enforcement (MASTER-RESCHEDULE-FIX-A)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    ensureNoConflictsExcluding.mockReset();
    invalidateSlotsForBookingMove.mockReset();
  });

  it("rejects move into the past / too close (BOOKING_TOO_SOON)", async () => {
    setupBooking();
    const tooSoon = new Date(Date.now() + 30 * 60 * 1000); // 30 min — minHours=2
    const result = await rescheduleBooking({
      bookingId: "b1",
      actorUserId: "master-1",
      actor: "MASTER",
      startAtUtc: tooSoon,
      endAtUtc: new Date(tooSoon.getTime() + 60 * 60 * 1000),
      slotLabel: "fmt",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BOOKING_TOO_SOON");
      expect(result.status).toBe(400);
    }
  });

  it("rejects move past the maxBookingDaysAhead horizon (BOOKING_TOO_FAR)", async () => {
    setupBooking();
    const tooFar = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000); // 40d — maxDays=30
    const result = await rescheduleBooking({
      bookingId: "b1",
      actorUserId: "master-1",
      actor: "MASTER",
      startAtUtc: tooFar,
      endAtUtc: new Date(tooFar.getTime() + 60 * 60 * 1000),
      slotLabel: "fmt",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BOOKING_TOO_FAR");
      expect(result.status).toBe(400);
    }
  });

  it("uses provider's policy values per booking (not hardcoded)", async () => {
    setupBooking({ provider: { minBookingHoursAhead: 24, maxBookingDaysAhead: 60 } });
    // 12h ahead — would pass default 2h policy but fails this provider's 24h.
    const halfDayAhead = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const result = await rescheduleBooking({
      bookingId: "b1",
      actorUserId: "master-1",
      actor: "MASTER",
      startAtUtc: halfDayAhead,
      endAtUtc: new Date(halfDayAhead.getTime() + 60 * 60 * 1000),
      slotLabel: "fmt",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BOOKING_TOO_SOON");
    }
  });

  it("still rejects CHANGE_REQUESTED bookings before the policy check (pre-existing guard #5а)", async () => {
    setupBooking({ status: BookingStatus.CHANGE_REQUESTED });
    // Even with a valid new time, pending change request takes priority
    // and returns CONFLICT — UI-disable + this guard together close #5а
    // bug surface.
    const validTime = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const result = await rescheduleBooking({
      bookingId: "b1",
      actorUserId: "master-1",
      actor: "MASTER",
      startAtUtc: validTime,
      endAtUtc: new Date(validTime.getTime() + 60 * 60 * 1000),
      slotLabel: "fmt",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFLICT");
      // ERR-LOCALIZATION-01: `code` уже проверен строкой выше — этот ассерт
      // различает, КАКОЙ именно CONFLICT вернулся (их несколько на этом пути),
      // поэтому проверяем курируемый текст, а не выкидываем проверку.
      expect(result.message).toContain("запрос на перенос");
    }
  });
});
