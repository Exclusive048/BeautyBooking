import { describe, expect, it } from "vitest";
import {
  formatGmtOffset,
  formatZoneLabel,
  getZoneOffsetMinutes,
  zonesDifferForViewer,
} from "./zone-label";

// QA-107 / FIX-22: pure Intl logic → node-safe. Locks the salon-tz zone-label
// contract (DST-aware offset, label format, viewer-emphasis decision).
describe("getZoneOffsetMinutes", () => {
  const summerIso = "2026-07-15T09:00:00.000Z";
  const winterIso = "2026-01-15T09:00:00.000Z";

  it("resolves fixed-offset CIS zones (no DST)", () => {
    expect(getZoneOffsetMinutes(summerIso, "Asia/Almaty")).toBe(300); // +5
    expect(getZoneOffsetMinutes(summerIso, "Europe/Moscow")).toBe(180); // +3
    expect(getZoneOffsetMinutes(summerIso, "Asia/Yekaterinburg")).toBe(300); // +5
  });

  it("handles UTC as 0", () => {
    expect(getZoneOffsetMinutes(summerIso, "UTC")).toBe(0);
  });

  it("is DST-aware for a zone that observes DST (Europe/Berlin)", () => {
    // Berlin: CEST (+2 / 120) in summer, CET (+1 / 60) in winter.
    expect(getZoneOffsetMinutes(summerIso, "Europe/Berlin")).toBe(120);
    expect(getZoneOffsetMinutes(winterIso, "Europe/Berlin")).toBe(60);
  });

  it("returns null for bad tz / bad instant (caller must flag, never host-fallback)", () => {
    expect(getZoneOffsetMinutes(summerIso, "Not/AZone")).toBeNull();
    expect(getZoneOffsetMinutes("not-a-date", "Asia/Yekaterinburg")).toBeNull();
    expect(getZoneOffsetMinutes(summerIso, null)).toBeNull();
    expect(getZoneOffsetMinutes(null, "Asia/Yekaterinburg")).toBeNull();
  });
});

describe("formatGmtOffset", () => {
  it("formats whole hours, half hours, zero, negatives", () => {
    expect(formatGmtOffset(300)).toBe("GMT+5");
    expect(formatGmtOffset(330)).toBe("GMT+5:30");
    expect(formatGmtOffset(0)).toBe("GMT");
    expect(formatGmtOffset(-180)).toBe("GMT-3");
    expect(formatGmtOffset(-210)).toBe("GMT-3:30");
  });
});

describe("formatZoneLabel", () => {
  const iso = "2026-07-15T09:00:00.000Z";

  it("renders «(Город, GMT+N)» for a mapped tz", () => {
    expect(formatZoneLabel({ iso, timeZone: "Asia/Almaty" })).toBe("(Алматы, GMT+5)");
    expect(formatZoneLabel({ iso, timeZone: "Europe/Moscow" })).toBe("(Москва, GMT+3)");
  });

  it("falls back to offset-only «(GMT+N)» for an unmapped tz", () => {
    expect(formatZoneLabel({ iso, timeZone: "America/New_York" })).toMatch(/^\(GMT[+-]\d/);
  });

  it("honors an explicit city override (for exact profile city)", () => {
    // The zone IS mapped («Екатеринбург»); the explicit city still wins.
    expect(formatZoneLabel({ iso, timeZone: "Asia/Yekaterinburg", city: "Первоуральск" })).toBe(
      "(Первоуральск, GMT+5)",
    );
  });

  it("returns '' when tz/instant cannot be resolved (no silent host fallback)", () => {
    expect(formatZoneLabel({ iso, timeZone: "Bad/Zone" })).toBe("");
    expect(formatZoneLabel({ iso: "nope", timeZone: "Asia/Yekaterinburg" })).toBe("");
  });
});

describe("zonesDifferForViewer (emphasis decision)", () => {
  const iso = "2026-07-15T09:00:00.000Z";

  it("false when viewer offset matches salon (same displayed time → label can be omitted)", () => {
    // Moscow (+3) and Kirov (+3) are distinct zones sharing the offset → identical wall clock.
    expect(zonesDifferForViewer({ iso, salonTimeZone: "Europe/Moscow", viewerTimeZone: "Europe/Kirov" })).toBe(false);
    expect(zonesDifferForViewer({ iso, salonTimeZone: "Europe/Moscow", viewerTimeZone: "Europe/Moscow" })).toBe(false);
  });

  it("true when offsets differ (must emphasize the label)", () => {
    expect(zonesDifferForViewer({ iso, salonTimeZone: "Asia/Yekaterinburg", viewerTimeZone: "Europe/Moscow" })).toBe(true);
  });

  it("errs toward showing the label when a side can't be resolved", () => {
    expect(zonesDifferForViewer({ iso, salonTimeZone: "Asia/Yekaterinburg", viewerTimeZone: "Bad/Zone" })).toBe(true);
  });
});
