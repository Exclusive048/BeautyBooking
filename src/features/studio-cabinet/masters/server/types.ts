import type { StudioMasterDisplayStatus } from "../lib/status-display";
import type { WeekScheduleCell } from "../lib/week-occupancy";

export type StudioMasterListItem = {
  id: string;
  providerId: string;
  /** Stable URL handle: prefers `Provider.publicUsername` (human-friendly,
   * already public), falls back to `id` when not set. Drives the
   * `?master=` selection param to avoid leaking raw cuids when a public
   * slug exists (STUDIO-POLISH-A #4). */
  urlHandle: string;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  servicesSummary: string;
  status: StudioMasterDisplayStatus;
  isCurrentUser: boolean;
  metrics: {
    revenue30dKopeks: number;
    bookings30d: number;
    occupancy30dPercent: number;
    rating: number;
    reviewsCount: number;
  };
};

export type StudioMastersCounts = {
  total: number;
  active: number;
  invited: number;
  disabled: number;
};

export type StudioMastersListData = {
  items: StudioMasterListItem[];
  counts: StudioMastersCounts;
};

export type StudioMasterDetail = StudioMasterListItem & {
  phone: string | null;
  email: string | null;
  joinedAt: string;
  publicProfileUrl: string | null;
  clientsCount: number;
  averageCheckKopeks: number;
  weekSchedule: WeekScheduleCell[];
};

export type StudioMasterFilter = "all" | "active" | "invited" | "disabled";

export function isStudioMasterFilter(value: unknown): value is StudioMasterFilter {
  return value === "all" || value === "active" || value === "invited" || value === "disabled";
}
