import { describe, expect, it } from "vitest";
import {
  TIMEZONE_OPTIONS,
  buildTimezoneOptions,
} from "@/lib/ui/timezone-options";

describe("timezone-options", () => {
  it("exposes a non-empty curated list with IANA values + RU labels", () => {
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(0);
    const moscow = TIMEZONE_OPTIONS.find((o) => o.value === "Europe/Moscow");
    expect(moscow).toBeDefined();
    expect(moscow?.label).toContain("Москва");
    expect(moscow?.label).toContain("Europe/Moscow");
    // Almaty stays selectable so existing CIS providers aren't pushed off it.
    expect(TIMEZONE_OPTIONS.some((o) => o.value === "Asia/Almaty")).toBe(true);
  });

  it("returns the curated list unchanged when current is already curated", () => {
    expect(buildTimezoneOptions("Europe/Moscow")).toEqual(TIMEZONE_OPTIONS);
    expect(buildTimezoneOptions("Asia/Almaty")).toEqual(TIMEZONE_OPTIONS);
  });

  it("returns the curated list when current is null/empty", () => {
    expect(buildTimezoneOptions(null)).toEqual(TIMEZONE_OPTIONS);
    expect(buildTimezoneOptions("")).toEqual(TIMEZONE_OPTIONS);
    expect(buildTimezoneOptions("   ")).toEqual(TIMEZONE_OPTIONS);
  });

  it("prepends an off-list current value so the stored tz is never dropped", () => {
    const options = buildTimezoneOptions("Pacific/Auckland");
    expect(options[0]).toEqual({
      value: "Pacific/Auckland",
      label: "Pacific/Auckland",
    });
    expect(options.length).toBe(TIMEZONE_OPTIONS.length + 1);
  });
});
