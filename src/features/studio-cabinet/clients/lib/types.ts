/**
 * STUDIO-CLIENTS-A: types for the studio clients page.
 *
 * Segments are derived (not stored) — reuse `classifyClient` from
 * `src/lib/master/clients-classifier.ts`. The master classifier returns
 * an array of statuses (e.g. ["vip", "sleeping"] for a once-regular
 * client who's been dormant for >90 days). For the studio sidebar we
 * pick a primary segment via `selectPrimarySegment` so each client lands
 * in exactly one bucket.
 *
 * Excluded segments:
 *   - birthday: no `ClientCard.birthday` field exists (backlog)
 *   - blacklist: no flag mechanism (tag enum has no "blacklist"; backlog)
 *   - custom: saved filter presets are a future feature (backlog)
 */

export type StudioClientPrimarySegment =
  | "vip"
  | "regular"
  | "new"
  | "sleeping"
  | "other";

export type StudioClientMasterChip = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type StudioClientRow = {
  /** Stable composite key from `groupBookings` — `user:<id>` or
   *  `phone:<normalized>`. Used as React key + cursor. */
  key: string;
  clientUserId: string | null;
  displayName: string;
  phone: string;
  visitsCount: number;
  /** Distinct count of masters this client has booked with in the
   *  studio. Drives the "у N мастеров" subtitle. */
  mastersCount: number;
  lifetimeKopeks: number;
  avgCheckKopeks: number;
  lastVisitAt: string | null;
  lastVisitDaysAgo: number | null;
  mainMaster: StudioClientMasterChip | null;
  /** All statuses from `classifyClient` (overlaps possible — a regular
   *  VIP who's gone dormant returns ["vip", "regular", "sleeping"]).
   *  Surfaced as a badge stack on the row. */
  segments: StudioClientPrimarySegment[];
  /** Primary segment for sidebar bucket assignment — picked via
   *  `selectPrimarySegment` (vip > sleeping > regular > new > other). */
  primarySegment: StudioClientPrimarySegment;
};

export type StudioClientSegmentKey =
  | "all"
  | "vip"
  | "regular"
  | "new"
  | "sleeping";

export type StudioClientsSegmentCounts = Record<StudioClientSegmentKey, number>;

export type StudioClientsKpis = {
  total: { count: number; addedThisMonth: number };
  active30d: { count: number; percentOfBase: number };
  avgLifetime: { kopeks: number };
  vip: { count: number; revenuePercent: number };
  sleeping: { count: number };
};

export type StudioClientsData = {
  items: StudioClientRow[];
  segmentCounts: StudioClientsSegmentCounts;
  kpis: StudioClientsKpis;
  filteredCount: number;
  totalCount: number;
  /** Next-page cursor (key of the last visible row). `null` when the
   *  current page is the last. */
  nextCursor: string | null;
  /** Master-picker options for the filter dropdown. */
  masterOptions: StudioClientMasterChip[];
};

export function isStudioClientSegmentKey(value: unknown): value is StudioClientSegmentKey {
  return value === "all" || value === "vip" || value === "regular" || value === "new" || value === "sleeping";
}
