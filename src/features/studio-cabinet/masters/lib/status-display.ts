/**
 * Studio master display status. Differs slightly from the schema's
 * `StudioMemberStatus` enum because the current data model derives the
 * "invited" state from `StudioInvite` presence (not from the
 * `StudioMember.status` column, which is not actively populated by the
 * invite flow). Three discrete states are surfaced in the UI:
 *
 *   - ACTIVE   — Provider.ownerUserId set + Provider.studioPaused false
 *   - INVITED  — pending StudioInvite for this provider's phone, no owner yet
 *   - DISABLED — Provider.ownerUserId set + Provider.studioPaused true
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
    "border-success-border bg-success-surface text-success-text",
  info: "border-info-border bg-info-surface text-info-text",
  muted: "border-border-subtle bg-bg-input text-text-sec",
};
