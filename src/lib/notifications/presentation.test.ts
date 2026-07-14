import { describe, expect, it } from "vitest";
import { resolveNotificationOpenHref } from "./presentation";

describe("resolveNotificationOpenHref — studio booking deep-link", () => {
  it("lands on the exact booking's calendar day, computed in SALON tz", () => {
    // BOOKING-STUDIO-RESCHEDULE-PARITY-01 + timezone-correctness anchor:
    // 21:00Z at Asia/Yekaterinburg (+5) is 02:00 the NEXT salon-local day, so
    // the `?date` must be 2026-07-11 (not the UTC calendar day 2026-07-10).
    const href = resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
      bookingId: "bk-1",
      providerType: "STUDIO",
      startAtUtc: "2026-07-10T21:00:00.000Z",
      providerTimezone: "Asia/Yekaterinburg",
    });
    expect(href).toBe(
      "/cabinet/studio/calendar?view=day&date=2026-07-11&focus=bk-1",
    );
  });

  it("falls back to ?focus= only for a legacy payload without a salon tz", () => {
    const href = resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
      bookingId: "bk-1",
      providerType: "STUDIO",
      startAtUtc: "2026-07-10T21:00:00.000Z",
    });
    expect(href).toBe("/cabinet/studio/calendar?focus=bk-1");
  });

  it("parses a stringified payload the same way", () => {
    const href = resolveNotificationOpenHref(
      "BOOKING_RESCHEDULE_REQUESTED",
      JSON.stringify({
        bookingId: "bk-1",
        providerType: "STUDIO",
        startAtUtc: "2026-07-10T21:00:00.000Z",
        providerTimezone: "Asia/Yekaterinburg",
      }),
    );
    expect(href).toBe(
      "/cabinet/studio/calendar?view=day&date=2026-07-11&focus=bk-1",
    );
  });

  it("keeps the master (non-studio) deep-link unchanged", () => {
    expect(
      resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
        bookingId: "bk-2",
        providerType: "MASTER",
      }),
    ).toBe("/cabinet/master/dashboard?focus=bk-2");
  });

  it("returns undefined when the payload has no bookingId", () => {
    expect(
      resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
        providerType: "STUDIO",
      }),
    ).toBeUndefined();
  });
});
