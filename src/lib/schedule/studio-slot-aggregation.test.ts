import { describe, expect, it } from "vitest";
import { mergeByStart, type AggregatedStudioSlot } from "./studio-slot-aggregation";

const SLOT_10 = { startAtUtc: "2026-05-20T10:00:00.000Z", endAtUtc: "2026-05-20T11:00:00.000Z", label: "2026-05-20 10:00" };
const SLOT_11 = { startAtUtc: "2026-05-20T11:00:00.000Z", endAtUtc: "2026-05-20T12:00:00.000Z", label: "2026-05-20 11:00" };
const SLOT_12 = { startAtUtc: "2026-05-20T12:00:00.000Z", endAtUtc: "2026-05-20T13:00:00.000Z", label: "2026-05-20 12:00" };

describe("studio-slot-aggregation / mergeByStart", () => {
  it("returns empty when there are no masters", () => {
    expect(mergeByStart([], [])).toEqual([]);
  });

  it("returns empty when no master has any slot", () => {
    expect(mergeByStart([{ masterId: "m1", slots: [] }], ["m1"])).toEqual([]);
  });

  it("preserves single-master slots", () => {
    const result = mergeByStart(
      [{ masterId: "m1", slots: [SLOT_10, SLOT_11] }],
      ["m1"],
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      startAtUtc: SLOT_10.startAtUtc,
      availableMasterIds: ["m1"],
      earliestMasterId: "m1",
    });
    expect(result[1]?.startAtUtc).toBe(SLOT_11.startAtUtc);
  });

  it("merges slots that share start time across two masters", () => {
    const result = mergeByStart(
      [
        { masterId: "m1", slots: [SLOT_10] },
        { masterId: "m2", slots: [SLOT_10] },
      ],
      ["m1", "m2"],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.availableMasterIds).toEqual(["m1", "m2"]);
    expect(result[0]?.earliestMasterId).toBe("m1");
  });

  it("preserves master input order in earliestMasterId", () => {
    // m2 listed first → m2 wins even when m1 also has the slot
    const result = mergeByStart(
      [
        { masterId: "m1", slots: [SLOT_10] },
        { masterId: "m2", slots: [SLOT_10] },
      ],
      ["m2", "m1"],
    );
    expect(result[0]?.availableMasterIds).toEqual(["m2", "m1"]);
    expect(result[0]?.earliestMasterId).toBe("m2");
  });

  it("aggregates a sparse schedule across three masters", () => {
    const result = mergeByStart(
      [
        { masterId: "m1", slots: [SLOT_10, SLOT_12] },
        { masterId: "m2", slots: [SLOT_11] },
        { masterId: "m3", slots: [SLOT_10, SLOT_11, SLOT_12] },
      ],
      ["m1", "m2", "m3"],
    );
    expect(result).toHaveLength(3);
    const at10 = result.find((s) => s.startAtUtc === SLOT_10.startAtUtc);
    const at11 = result.find((s) => s.startAtUtc === SLOT_11.startAtUtc);
    const at12 = result.find((s) => s.startAtUtc === SLOT_12.startAtUtc);
    expect(at10?.availableMasterIds).toEqual(["m1", "m3"]);
    expect(at11?.availableMasterIds).toEqual(["m2", "m3"]);
    expect(at12?.availableMasterIds).toEqual(["m1", "m3"]);
  });

  it("sorts aggregated slots chronologically by start time", () => {
    const result = mergeByStart(
      [
        { masterId: "m1", slots: [SLOT_12, SLOT_10] },
        { masterId: "m2", slots: [SLOT_11] },
      ],
      ["m1", "m2"],
    );
    expect(result.map((s) => s.startAtUtc)).toEqual([
      SLOT_10.startAtUtc,
      SLOT_11.startAtUtc,
      SLOT_12.startAtUtc,
    ]);
  });

  it("does not duplicate a master if their per-master list has the same slot twice", () => {
    const result = mergeByStart(
      [{ masterId: "m1", slots: [SLOT_10, SLOT_10] }],
      ["m1"],
    );
    expect(result[0]?.availableMasterIds).toEqual(["m1"]);
  });

  it("places masters absent from masterOrder at the end of availableMasterIds", () => {
    // m3 isn't in masterOrder — it should still appear in the aggregated
    // result (the engine may return it) but ordered after known masters.
    const result: AggregatedStudioSlot[] = mergeByStart(
      [
        { masterId: "m1", slots: [SLOT_10] },
        { masterId: "m3", slots: [SLOT_10] },
      ],
      ["m1"],
    );
    expect(result[0]?.availableMasterIds[0]).toBe("m1");
    expect(result[0]?.availableMasterIds).toContain("m3");
  });
});
