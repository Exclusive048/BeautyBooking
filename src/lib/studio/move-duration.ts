/**
 * FIX-6 (HARDENING-04): the duration a studio `moveStudioBooking` will actually
 * persist — the SINGLE source of truth for BOTH the validated/stored `endAtUtc`
 * window AND the rewritten `durationSnapshotMin`.
 *
 * The bug: `endAt` (hence the work-hours guard, the conflict check, and the
 * stored `endAtUtc`) was computed from the OLD service durations, while
 * CHANGE_SERVICE rewrote `durationSnapshotMin` to the (possibly LONGER) target
 * duration afterwards WITHOUT recomputing `endAtUtc` — the extra tail minutes
 * were unprotected → a second booking could land inside the tail (double-book).
 *
 * Routing both the window sum and the snapshot write through these helpers makes
 * the checked window and the stored duration provably identical.
 */

export type MoveStrategyLite = "KEEP_SERVICE" | "CHANGE_SERVICE";

export type MoveServiceItemDuration = {
  serviceId: string | null;
  durationSnapshotMin: number;
};

export type MoveTargetOverride = {
  isEnabled: boolean;
  durationOverrideMin: number | null;
  service: { durationMin: number };
};

/**
 * Per-item duration this move persists: CHANGE_SERVICE adopts the target
 * master's service duration (override → base), KEEP_SERVICE keeps the booking's
 * current snapshot. An item without a serviceId, or a CHANGE_SERVICE item whose
 * target override is missing/disabled, keeps the current snapshot (defensive —
 * `assertMasterPerformsService` already blocks the incompatible case upstream).
 */
export function resolveMoveItemDurationMin<O extends MoveTargetOverride>(
  item: MoveServiceItemDuration,
  strategy: MoveStrategyLite,
  overrideByServiceId: Map<string, O>,
): number {
  if (strategy === "CHANGE_SERVICE" && item.serviceId) {
    const override = overrideByServiceId.get(item.serviceId);
    if (override && override.isEnabled) {
      return override.durationOverrideMin ?? override.service.durationMin;
    }
  }
  return item.durationSnapshotMin;
}

/** Total move-window duration (minutes), summed over the booking's items. */
export function resolveMoveDurationMin<O extends MoveTargetOverride>(
  serviceItems: ReadonlyArray<MoveServiceItemDuration>,
  strategy: MoveStrategyLite,
  overrideByServiceId: Map<string, O>,
): number {
  return serviceItems.reduce(
    (sum, item) => sum + Math.max(0, resolveMoveItemDurationMin(item, strategy, overrideByServiceId)),
    0,
  );
}
