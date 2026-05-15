/**
 * Studio master display status. Differs slightly from the schema's
 * `StudioMemberStatus` enum because the current data model derives the
 * "invited" state from `StudioInvite` presence (not from the
 * `StudioMember.status` column, which is not actively populated by the
 * invite flow). Three discrete states are surfaced in the UI:
 *
 *   - ACTIVE   — Provider.ownerUserId set + Provider.isPublished true
 *   - INVITED  — pending StudioInvite for this provider's phone, no owner yet
 *   - DISABLED — Provider.ownerUserId set + Provider.isPublished false
 *
 * The reference spec mentions a fourth status ("В отпуске" / vacation).
 * We do **not** introduce it here — there is no schema field to back it,
 * and the "Пауза" status covers the same UX need until a dedicated
 * vacation feature lands (BACKLOG).
 */
export type StudioMasterDisplayStatus = "ACTIVE" | "INVITED" | "DISABLED";

export type StatusTone = "success" | "info" | "muted";

export function getStatusTone(status: StudioMasterDisplayStatus): StatusTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INVITED":
      return "info";
    case "DISABLED":
      return "muted";
  }
}

export const STATUS_BADGE_CLASS: Record<StatusTone, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300",
  muted: "border-border-subtle bg-bg-input text-text-sec",
};
