import { classifyClient, type ClientStats, type ClientStatus } from "@/lib/master/clients-classifier";
import type { StudioClientPrimarySegment, StudioClientSegmentKey } from "./types";

/**
 * Wrap the master classifier so the studio cabinet uses the **exact same**
 * thresholds (VIP_LTV_KOPEKS = 5 000 000, REGULAR = 5 visits, NEW < 30d
 * or ≤1 visit, SLEEPING > 90d since last visit). Reuse over duplication
 * keeps STUDIO-BOOKINGS-A's VIP signal and the master cabinet's CRM
 * page consistent — a client tagged VIP in the master view stays VIP
 * in the studio view.
 */
export function classifyStudioClient(stats: ClientStats, now: Date = new Date()): ClientStatus[] {
  return classifyClient(stats, now);
}

/** Map a status array → single primary bucket for sidebar assignment.
 *  Priority order: VIP > sleeping > regular > new > other. A regular VIP
 *  who's gone dormant lands in "sleeping" — that's where the admin needs
 *  to see them for reactivation. */
export function selectPrimarySegment(statuses: ClientStatus[]): StudioClientPrimarySegment {
  if (statuses.includes("vip")) return "vip";
  if (statuses.includes("sleeping")) return "sleeping";
  if (statuses.includes("regular")) return "regular";
  if (statuses.includes("new")) return "new";
  return "other";
}

export function segmentMatches(row: { primarySegment: StudioClientPrimarySegment }, segment: StudioClientSegmentKey): boolean {
  if (segment === "all") return true;
  return row.primarySegment === segment;
}
