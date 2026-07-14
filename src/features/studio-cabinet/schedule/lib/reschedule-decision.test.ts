import { describe, expect, it } from "vitest";
import type { BookingStatus } from "@prisma/client";
import { formatLocalHm } from "@/lib/schedule/timezone";
import {
  bookingDecisionUrl,
  isPendingClientReschedule,
  mapProposedReschedule,
} from "./reschedule-decision";

describe("mapProposedReschedule", () => {
  it("maps set proposed times to UTC ISO strings", () => {
    const result = mapProposedReschedule({
      proposedStartAt: new Date("2026-07-10T08:00:00.000Z"),
      proposedEndAt: new Date("2026-07-10T09:30:00.000Z"),
      actionRequiredBy: "MASTER",
    });
    expect(result).toEqual({
      proposedStartAtUtc: "2026-07-10T08:00:00.000Z",
      proposedEndAtUtc: "2026-07-10T09:30:00.000Z",
      actionRequiredBy: "MASTER",
    });
  });

  it("maps a booking with no pending reschedule to all-null (neutral)", () => {
    expect(
      mapProposedReschedule({
        proposedStartAt: null,
        proposedEndAt: null,
        actionRequiredBy: null,
      }),
    ).toEqual({
      proposedStartAtUtc: null,
      proposedEndAtUtc: null,
      actionRequiredBy: null,
    });
  });
});

describe("isPendingClientReschedule", () => {
  const base = {
    status: "CHANGE_REQUESTED" as BookingStatus,
    actionRequiredBy: "MASTER" as const,
    proposedStartAtUtc: "2026-07-10T08:00:00.000Z",
  };

  it("is true when the CLIENT proposed and the studio must respond", () => {
    expect(isPendingClientReschedule(base)).toBe(true);
  });

  it("is false when the studio/master is the initiator (waiting on client)", () => {
    // actionRequiredBy === "CLIENT" → the provider proposed; nothing to accept.
    expect(
      isPendingClientReschedule({ ...base, actionRequiredBy: "CLIENT" }),
    ).toBe(false);
  });

  it("is false when there is no proposed time (half-cleared row guard)", () => {
    expect(
      isPendingClientReschedule({ ...base, proposedStartAtUtc: null }),
    ).toBe(false);
  });

  it("is false for a non-CHANGE_REQUESTED booking", () => {
    expect(
      isPendingClientReschedule({
        ...base,
        status: "CONFIRMED" as BookingStatus,
      }),
    ).toBe(false);
    expect(
      isPendingClientReschedule({
        status: "PENDING" as BookingStatus,
        actionRequiredBy: null,
        proposedStartAtUtc: null,
      }),
    ).toBe(false);
  });
});

describe("bookingDecisionUrl", () => {
  it("accept → the confirm endpoint, decline → the decline-reschedule endpoint", () => {
    expect(bookingDecisionUrl("bk-123", "accept")).toBe(
      "/api/bookings/bk-123/confirm",
    );
    expect(bookingDecisionUrl("bk-123", "decline")).toBe(
      "/api/bookings/bk-123/decline-reschedule",
    );
  });

  it("encodes the booking id", () => {
    expect(bookingDecisionUrl("a b/c", "accept")).toBe(
      "/api/bookings/a%20b%2Fc/confirm",
    );
  });
});

describe("proposed-reschedule time is displayed in salon-tz (not viewer-tz)", () => {
  // Timezone-correctness anchor (Vision / Екатеринбург, GMT+5): the action
  // menu renders the proposed time via `formatLocalHm(proposed, salonTz)`.
  // 08:00Z MUST read 13:00 at Asia/Yekaterinburg regardless of the admin's
  // browser tz — testing only on Moscow would mask a viewer-tz regression.
  it("08:00Z renders 13:00 at Asia/Yekaterinburg", () => {
    expect(
      formatLocalHm(new Date("2026-07-10T08:00:00.000Z"), "Asia/Yekaterinburg"),
    ).toBe("13:00");
  });
});
