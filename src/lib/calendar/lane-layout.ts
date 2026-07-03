/**
 * FIX-BATCH-E — pure interval-overlap lane assignment for calendar grids.
 *
 * Standard "columns within overlap groups" algorithm (à la Google Calendar):
 * bookings that overlap in time are split into side-by-side lanes so their
 * text stays readable instead of stacking on top of each other. All items in
 * one transitive overlap group share the group's lane count as their width
 * divisor (equal `1 / laneCount` width) — predictable and never-overlapping.
 *
 * Pure + client-safe (no imports) — reused by the master week grid AND the
 * studio day grid, which are otherwise separate implementations. Layout math
 * only: operates over already-loaded bookings, never touches booking data,
 * status, or the schedule engine.
 *
 * `start`/`end` are any comparable numbers on the same axis (minute-of-day for
 * the master grid, epoch-ms for the studio grid) — only ordering matters.
 */
export type LaneItem = { id: string; start: number; end: number };
export type LanePlacement = { lane: number; laneCount: number };

export function assignLanes(items: LaneItem[]): Map<string, LanePlacement> {
  const result = new Map<string, LanePlacement>();
  if (items.length === 0) return result;

  // Sort by start asc, then end asc for stable, deterministic placement.
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  let groupIds: string[] = [];
  // columns[i] = end time of the last item placed in lane `i` for the current group.
  let columns: number[] = [];
  let groupMaxEnd = -Infinity;

  const flush = () => {
    const laneCount = columns.length;
    for (const id of groupIds) {
      const placement = result.get(id);
      if (placement) placement.laneCount = laneCount;
    }
    groupIds = [];
    columns = [];
    groupMaxEnd = -Infinity;
  };

  for (const item of sorted) {
    // A gap (this item starts at/after every active item's end) closes the group.
    if (groupIds.length > 0 && item.start >= groupMaxEnd) {
      flush();
    }
    // Place in the first lane whose last item ended at/before this item's start.
    let lane = -1;
    for (let i = 0; i < columns.length; i += 1) {
      if (columns[i]! <= item.start) {
        lane = i;
        break;
      }
    }
    if (lane === -1) {
      lane = columns.length;
      columns.push(item.end);
    } else {
      columns[lane] = item.end;
    }
    result.set(item.id, { lane, laneCount: 1 }); // laneCount finalized at flush
    groupIds.push(item.id);
    groupMaxEnd = Math.max(groupMaxEnd, item.end);
  }
  flush();

  return result;
}

/**
 * CSS `left`/`width` for a lane within its column, with a small inter-lane
 * gutter. `laneCount === 1` (the common no-overlap case) reproduces the prior
 * full-width block (a 2px inset each side).
 */
export function laneStyle(
  placement: LanePlacement | undefined,
): { left: string; width: string } {
  const lane = placement?.lane ?? 0;
  const count = Math.max(1, placement?.laneCount ?? 1);
  const pct = 100 / count;
  return {
    left: `calc(${lane * pct}% + 2px)`,
    width: `calc(${pct}% - 4px)`,
  };
}
