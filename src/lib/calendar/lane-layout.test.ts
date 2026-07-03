import { describe, expect, it } from "vitest";
import { assignLanes, laneStyle } from "@/lib/calendar/lane-layout";

function p(map: Map<string, { lane: number; laneCount: number }>, id: string) {
  const v = map.get(id);
  if (!v) throw new Error(`no placement for ${id}`);
  return v;
}

describe("assignLanes", () => {
  it("returns empty for empty input", () => {
    expect(assignLanes([]).size).toBe(0);
  });

  it("single booking → one lane, full width", () => {
    const m = assignLanes([{ id: "a", start: 0, end: 60 }]);
    expect(p(m, "a")).toEqual({ lane: 0, laneCount: 1 });
  });

  it("two concurrent → two side-by-side lanes", () => {
    const m = assignLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 30, end: 90 },
    ]);
    expect(p(m, "a")).toEqual({ lane: 0, laneCount: 2 });
    expect(p(m, "b")).toEqual({ lane: 1, laneCount: 2 });
  });

  it("three concurrent → three lanes", () => {
    const m = assignLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 10, end: 70 },
      { id: "c", start: 20, end: 80 },
    ]);
    expect(p(m, "a")).toEqual({ lane: 0, laneCount: 3 });
    expect(p(m, "b")).toEqual({ lane: 1, laneCount: 3 });
    expect(p(m, "c")).toEqual({ lane: 2, laneCount: 3 });
  });

  it("non-overlapping bookings → separate groups, each full width", () => {
    const m = assignLanes([
      { id: "a", start: 0, end: 30 },
      { id: "b", start: 60, end: 90 },
    ]);
    expect(p(m, "a")).toEqual({ lane: 0, laneCount: 1 });
    expect(p(m, "b")).toEqual({ lane: 0, laneCount: 1 });
  });

  it("touching bookings (end === next start) do not overlap", () => {
    const m = assignLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 60, end: 120 },
    ]);
    expect(p(m, "a").laneCount).toBe(1);
    expect(p(m, "b").laneCount).toBe(1);
    expect(p(m, "b").lane).toBe(0);
  });

  it("chained overlap reuses a freed lane but shares the group's lane count", () => {
    // a(0-60) & b(30-90) overlap; c(80-120) overlaps b → one transitive group,
    // max 2 concurrent. c reuses a's lane (a ended at 60 before c starts at 80).
    const m = assignLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 30, end: 90 },
      { id: "c", start: 80, end: 120 },
    ]);
    expect(p(m, "a")).toEqual({ lane: 0, laneCount: 2 });
    expect(p(m, "b")).toEqual({ lane: 1, laneCount: 2 });
    expect(p(m, "c")).toEqual({ lane: 0, laneCount: 2 });
  });

  it("is order-independent (sorts internally)", () => {
    const m = assignLanes([
      { id: "b", start: 30, end: 90 },
      { id: "a", start: 0, end: 60 },
    ]);
    expect(p(m, "a")).toEqual({ lane: 0, laneCount: 2 });
    expect(p(m, "b")).toEqual({ lane: 1, laneCount: 2 });
  });
});

describe("laneStyle", () => {
  it("full width for a single lane", () => {
    expect(laneStyle({ lane: 0, laneCount: 1 })).toEqual({
      left: "calc(0% + 2px)",
      width: "calc(100% - 4px)",
    });
  });
  it("half width, second lane", () => {
    expect(laneStyle({ lane: 1, laneCount: 2 })).toEqual({
      left: "calc(50% + 2px)",
      width: "calc(50% - 4px)",
    });
  });
  it("undefined placement → full width fallback", () => {
    expect(laneStyle(undefined)).toEqual({
      left: "calc(0% + 2px)",
      width: "calc(100% - 4px)",
    });
  });
});
