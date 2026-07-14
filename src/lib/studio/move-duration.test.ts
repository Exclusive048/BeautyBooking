import { describe, it, expect } from "vitest";
import {
  resolveMoveDurationMin,
  resolveMoveItemDurationMin,
  type MoveTargetOverride,
} from "@/lib/studio/move-duration";

/** Build an override map from `serviceId → {isEnabled, durationOverrideMin, durationMin}`. */
function overrides(
  rows: Record<string, { isEnabled?: boolean; durationOverrideMin?: number | null; durationMin: number }>,
): Map<string, MoveTargetOverride> {
  return new Map(
    Object.entries(rows).map(([serviceId, r]) => [
      serviceId,
      {
        isEnabled: r.isEnabled ?? true,
        durationOverrideMin: r.durationOverrideMin ?? null,
        service: { durationMin: r.durationMin },
      },
    ]),
  );
}

describe("resolveMoveItemDurationMin — HARDENING-04 FIX-6", () => {
  const map = overrides({ s1: { durationOverrideMin: 60, durationMin: 45 }, s2: { durationMin: 90 } });

  it("CHANGE_SERVICE + enabled override → the target override duration", () => {
    expect(resolveMoveItemDurationMin({ serviceId: "s1", durationSnapshotMin: 30 }, "CHANGE_SERVICE", map)).toBe(60);
  });

  it("CHANGE_SERVICE + enabled override with null override → the target base service duration", () => {
    expect(resolveMoveItemDurationMin({ serviceId: "s2", durationSnapshotMin: 30 }, "CHANGE_SERVICE", map)).toBe(90);
  });

  it("CHANGE_SERVICE + disabled override → keeps the current snapshot (defensive)", () => {
    const disabled = overrides({ s1: { isEnabled: false, durationOverrideMin: 60, durationMin: 45 } });
    expect(resolveMoveItemDurationMin({ serviceId: "s1", durationSnapshotMin: 30 }, "CHANGE_SERVICE", disabled)).toBe(30);
  });

  it("CHANGE_SERVICE + missing override → keeps the current snapshot", () => {
    expect(resolveMoveItemDurationMin({ serviceId: "unknown", durationSnapshotMin: 30 }, "CHANGE_SERVICE", map)).toBe(30);
  });

  it("CHANGE_SERVICE + null serviceId → keeps the current snapshot", () => {
    expect(resolveMoveItemDurationMin({ serviceId: null, durationSnapshotMin: 30 }, "CHANGE_SERVICE", map)).toBe(30);
  });

  it("KEEP_SERVICE → keeps the current snapshot even when a target override exists", () => {
    expect(resolveMoveItemDurationMin({ serviceId: "s1", durationSnapshotMin: 30 }, "KEEP_SERVICE", map)).toBe(30);
  });
});

describe("resolveMoveDurationMin — window equals what the move persists", () => {
  it("🔴 CHANGE_SERVICE to a LONGER target recomputes the window to the target (closes the tail)", () => {
    // The double-book: old snapshot 30, target 60. The stored/checked window must
    // be 60 (start+60), not the old 30 — otherwise the extra 30-min tail is unprotected.
    const map = overrides({ s1: { durationOverrideMin: 60, durationMin: 60 } });
    expect(resolveMoveDurationMin([{ serviceId: "s1", durationSnapshotMin: 30 }], "CHANGE_SERVICE", map)).toBe(60);
  });

  it("KEEP_SERVICE keeps the current total", () => {
    const map = overrides({ s1: { durationOverrideMin: 60, durationMin: 60 } });
    expect(resolveMoveDurationMin([{ serviceId: "s1", durationSnapshotMin: 30 }], "KEEP_SERVICE", map)).toBe(30);
  });

  it("sums across multiple items (CHANGE_SERVICE)", () => {
    const map = overrides({ s1: { durationOverrideMin: 60, durationMin: 45 }, s2: { durationMin: 90 } });
    expect(
      resolveMoveDurationMin(
        [
          { serviceId: "s1", durationSnapshotMin: 30 },
          { serviceId: "s2", durationSnapshotMin: 20 },
        ],
        "CHANGE_SERVICE",
        map,
      ),
    ).toBe(150);
  });

  it("empty items → 0 (caller applies the 60-min floor)", () => {
    expect(resolveMoveDurationMin([], "CHANGE_SERVICE", new Map())).toBe(0);
  });

  it("clamps negative per-item snapshots to 0", () => {
    expect(resolveMoveDurationMin([{ serviceId: null, durationSnapshotMin: -10 }], "KEEP_SERVICE", new Map())).toBe(0);
  });
});
