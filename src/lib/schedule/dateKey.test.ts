import {
  addDaysToDateKey,
  compareDateKeys,
  dateFromLocalDateKey,
  diffDateKeys,
  isDateKey,
  listDateKeysExclusive,
  parseDateKeyParts,
  parseDateKeyToUtc,
} from "@/lib/schedule/dateKey";

describe("schedule/dateKey", () => {
  it("parses valid keys and rejects invalid ones", () => {
    expect(parseDateKeyParts("2026-03-03")).toEqual({ year: 2026, month: 3, day: 3 });
    expect(parseDateKeyParts("2026-3-3")).toBeNull();
    expect(isDateKey("2026-03-03")).toBe(true);
    expect(isDateKey("nope")).toBe(false);
  });

  it("adds days and compares keys", () => {
    expect(addDaysToDateKey("2026-03-03", 1)).toBe("2026-03-04");
    expect(compareDateKeys("2026-03-03", "2026-03-03")).toBe(0);
    expect(compareDateKeys("2026-03-03", "2026-03-04")).toBe(-1);
  });

  it("computes diff and lists date keys", () => {
    expect(diffDateKeys("2026-03-01", "2026-03-04")).toBe(3);
    expect(listDateKeysExclusive("2026-03-01", "2026-03-04")).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
  });

  it("converts date key to UTC date and local date", () => {
    const utc = parseDateKeyToUtc("2026-03-03");
    expect(utc.toISOString().startsWith("2026-03-03T12:00:00.000Z")).toBe(true);

    const local = dateFromLocalDateKey("2026-03-03", "UTC", 9, 30);
    expect(local.toISOString().startsWith("2026-03-03T09:30:00.000Z")).toBe(true);
  });
});
