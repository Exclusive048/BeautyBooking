import { describe, expect, it } from "vitest";

import { UI_FMT } from "@/lib/ui/fmt";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { formatAvailability } from "@/features/catalog/lib/slot-precision-format";

/**
 * TZ-DISPLAY-SALON-PARITY-01 — the DISPLAY surfaces (skill §3a).
 *
 * These booking/slot times used to render in the viewer's browser tz; they now
 * render in the SALON (provider) tz via the sanctioned `UI_FMT.*({ timeZone })`
 * + `zone-label` composition. This pins the invariant per surface: a Vision
 * (Asia/Yekaterinburg, +5) slot at 08:00Z shows «13:00», NOT the 11:00 a
 * Moscow viewer's browser tz would have shown. The +5/+3 split is deliberate
 * (§5 — Moscow-only testing masks the bug). All helpers are Intl+tz explicit,
 * so results are independent of the test runner's own tz.
 */
const INSTANT = "2026-07-07T08:00:00.000Z"; // 13:00 in EKB, 11:00 in MSK
const EKB = "Asia/Yekaterinburg"; // +5, no DST
const MSK = "Europe/Moscow"; // +3, no DST

describe("surface 1 — master reschedule-modal (slot times + current-time label)", () => {
  it("Vision (+5): a slot instant renders 13:00 in salon-tz (not the 11:00 of a Moscow viewer)", () => {
    expect(UI_FMT.timeShort(INSTANT, { timeZone: EKB })).toBe("13:00");
  });

  it("Moscow control (+3): the same instant renders 11:00", () => {
    expect(UI_FMT.timeShort(INSTANT, { timeZone: MSK })).toBe("11:00");
  });

  it("Vision (+5): the «current time» date part is salon-local too", () => {
    expect(UI_FMT.dateShort(INSTANT, { timeZone: EKB })).toBe("07.07");
  });
});

describe("surface 2 — /book nearest-slot chips (dormant but correct-when-lit)", () => {
  it("Vision (+5): a nearest slot renders «07.07 13:00» in salon-tz", () => {
    expect(UI_FMT.dateTimeShort(INSTANT, { timeZone: EKB })).toBe("07.07 13:00");
  });

  it("Moscow control (+3): «07.07 11:00»", () => {
    expect(UI_FMT.dateTimeShort(INSTANT, { timeZone: MSK })).toBe("07.07 11:00");
  });
});

describe("surface 3 — CRM client-card visit history", () => {
  it("Vision (+5): a past visit renders «07.07 13:00» in the cabinet's provider tz", () => {
    expect(UI_FMT.dateTimeShort(INSTANT, { timeZone: EKB })).toBe("07.07 13:00");
  });
});

describe("surface 6 — catalog card «Ближайшее» (dormant, fixed-when-lit)", () => {
  it("Vision (+5): the exact-precision nearest slot label carries the salon-tz time", () => {
    const out = formatAvailability({
      precision: "exact",
      nextSlotStartAt: INSTANT,
      availableToday: false,
      timeZone: EKB,
      fallbackToOpen: false,
    });
    expect(out.tone).toBe("available");
    expect(out.label).toContain("13:00");
    expect(out.label).not.toContain("11:00");
  });

  it("Moscow control (+3): the same slot label carries 11:00", () => {
    const out = formatAvailability({
      precision: "exact",
      nextSlotStartAt: INSTANT,
      availableToday: false,
      timeZone: MSK,
      fallbackToOpen: false,
    });
    expect(out.label).toContain("11:00");
  });
});

describe("shared — zone-label decision (skill §2: label when viewer differs)", () => {
  it("shows «(Екатеринбург, GMT+5)» for a Vision slot", () => {
    expect(formatZoneLabel({ iso: INSTANT, timeZone: EKB })).toBe(
      "(Екатеринбург, GMT+5)",
    );
  });

  it("emphasises the salon tz when the viewer is in a different zone", () => {
    expect(
      zonesDifferForViewer({
        iso: INSTANT,
        salonTimeZone: EKB,
        viewerTimeZone: MSK,
      }),
    ).toBe(true);
  });

  it("omits the label when the viewer is already in the salon tz", () => {
    expect(
      zonesDifferForViewer({
        iso: INSTANT,
        salonTimeZone: MSK,
        viewerTimeZone: MSK,
      }),
    ).toBe(false);
  });
});
