/**
 * STUDIO-SETTINGS-A — types for the studio cabinet settings page.
 *
 * Five sections per spec. Sections that would need infrastructure we
 * don't have (payouts, integrations, per-NotificationType preferences,
 * SMS, birthday) are intentionally absent — each is tracked separately
 * in BACKLOG. The page surfaces only fields that exist in the schema
 * today.
 *
 * Scope flags drive UI gating:
 *   - OWNER: full access, including the danger zone (archive/delete).
 *   - ADMIN: settings access, no destructive operations.
 *   - MASTER: not admitted (route gated upstream).
 */

import type { StudioRole } from "@prisma/client";

export type StudioSettingsSection =
  | "general"
  | "owner-team"
  | "notifications"
  | "policy"
  | "danger";

export type StudioSettingsScope = {
  isOwner: boolean;
  isAdmin: boolean;
  /** Resolved roles array from `StudioMembership.roles`. */
  roles: StudioRole[];
  /** Owner can archive + delete; admin cannot. */
  canDanger: boolean;
};

export type StudioGeneralData = {
  studioId: string;
  providerId: string;
  name: string;
  tagline: string;
  description: string | null;
  avatarUrl: string | null;
  isPublished: boolean;
  address: {
    cityName: string | null;
    address: string | null;
    district: string | null;
    geoLat: number | null;
    geoLng: number | null;
    /** Pre-built Yandex Maps URL — opens the address in a new tab. */
    mapUrl: string | null;
  };
};

export type StudioTeamMember = {
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  roles: StudioRole[];
  isCurrentUser: boolean;
};

export type StudioOwnerTeamData = {
  owner: StudioTeamMember | null;
  /** Other admins (StudioMembership with ADMIN role, excluding the owner). */
  admins: StudioTeamMember[];
};

export type StudioNotificationsData = {
  pushEnabled: boolean;
  /** Telegram + VK channel state surfaced via the existing per-channel
   *  sections — both are reused as-is. */
};

export type StudioPolicyData = {
  /** `Provider.minBookingHoursAhead` — int hours. */
  minBookingHoursAhead: number;
  maxBookingDaysAhead: number;
  /** `Provider.cancellationDeadlineHours` — nullable. */
  cancellationDeadlineHours: number | null;
  /** `Provider.lateCancelAction` enum-ish string — currently stored but
   *  not enforced (cross-ref L3 backlog from master schedule settings). */
  lateCancelAction: string;
  acceptNewClients: boolean;
  remindersEnabled: boolean;
};

export type StudioSettingsData = {
  scope: StudioSettingsScope;
  general: StudioGeneralData;
  team: StudioOwnerTeamData;
  notifications: StudioNotificationsData;
  policy: StudioPolicyData;
};

export function isStudioSettingsSection(value: unknown): value is StudioSettingsSection {
  return (
    value === "general" ||
    value === "owner-team" ||
    value === "notifications" ||
    value === "policy" ||
    value === "danger"
  );
}
