import { describe, expect, it } from "vitest";

import { formatBookingWhenLabel } from "./format-booking-when";

/**
 * HARDENING-09 #13 — the shared salon-tz "when" formatter (used by both the
 * in-app lifecycle path and the Telegram reminder). The SKILL-TZ anchor: an
 * 08:00Z instant must render 13:00 for a Yekaterinburg (+5) salon, with an
 * explicit GMT label, regardless of the recipient's own clock.
 */

const INSTANT = new Date("2026-07-07T08:00:00Z");

describe("formatBookingWhenLabel", () => {
  it("renders a non-Moscow salon (Yekaterinburg, GMT+5) in salon-local time with a zone label", () => {
    const out = formatBookingWhenLabel(INSTANT, "Asia/Yekaterinburg");
    expect(out).toContain("13:00"); // 08:00Z + 5, NOT raw 08:00
    expect(out).toContain("07.07");
    expect(out).toContain("GMT+5");
    expect(out).toContain("Екатеринбург");
    expect(out).not.toContain("08:00");
  });

  it("renders the Moscow control (GMT+3) correctly — guards against a UTC-vs-salon regression", () => {
    const out = formatBookingWhenLabel(INSTANT, "Europe/Moscow");
    expect(out).toContain("11:00"); // 08:00Z + 3
    expect(out).toContain("GMT+3");
    expect(out).toContain("Москва");
  });

  it("returns null when there is no instant (caller falls back to the slot label)", () => {
    expect(formatBookingWhenLabel(null, "Asia/Yekaterinburg")).toBeNull();
  });
});
