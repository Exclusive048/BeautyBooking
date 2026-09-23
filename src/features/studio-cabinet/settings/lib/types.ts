/**
 * STUDIO-SETTINGS-A — types for the studio cabinet settings page.
 *
 * FIX-STUDIO-SETTINGS-MERGE (2026-09-13): разделов стало шесть — «Общее» и
 * «Профиль и медиа» слиты в «Профиль» (слоган переехал в форму профиля, а
 * карточка адреса в «Общем» дублировала редактируемую рядом).
 *
 * Sections that would need infrastructure we
 * don't have (payouts, integrations, per-NotificationType preferences,
 * SMS, birthday) are intentionally absent — each is tracked separately
 * in BACKLOG. The page surfaces only fields that exist in the schema
 * today.
 *
 * Scope flags drive UI gating:
 *   - OWNER: full access, including the danger zone (permanent delete).
 *   - ADMIN: settings access, no destructive operations.
 *   - MASTER: not admitted (route gated upstream).
 */

import type { StudioRole } from "@prisma/client";

export type StudioSettingsSection =
  | "profile"
  | "portfolio"
  | "owner-team"
  | "notifications"
  | "policy"
  | "danger";

/** Раздел по умолчанию — открывается без `?section=`. */
export const DEFAULT_STUDIO_SETTINGS_SECTION: StudioSettingsSection = "profile";

/**
 * FIX-STUDIO-SETTINGS-MERGE: «Общее» и «Профиль и медиа» слиты в «Профиль».
 *
 * Старые ключи остаются ПРИНИМАЕМЫМИ: `?section=profile-media` живёт в закладках
 * и во внешних ссылках (по нему пользователь и пришёл с замечанием), а
 * `?section=general` был значением по умолчанию, то есть попал в историю
 * браузера у всех. Молча отдавать им дефолт — это правильно, но пусть это будет
 * записанным решением, а не побочным эффектом `isStudioSettingsSection`.
 */
const LEGACY_SECTION_ALIASES: Record<string, StudioSettingsSection> = {
  general: "profile",
  "profile-media": "profile",
};

export type StudioSettingsScope = {
  isOwner: boolean;
  isAdmin: boolean;
  /** Resolved roles array from `StudioMembership.roles`. */
  roles: StudioRole[];
  /** Owner can delete the studio; admin cannot. */
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
  /**
   * Current IANA timezone.
   *
   * FIX-STUDIO-TZ-FROM-ADDRESS: селектора больше нет — зону выводит сервер из
   * города адреса (`updateStudioProviderProfile`), а раздел «Профиль» её
   * ПОКАЗЫВАЕТ, получая вместе с остальным профилем из `GET /api/studios/[id]`.
   * Здесь поле оставлено как часть снапшота настроек (SSR-данные раздела).
   */
  timezone: string;
  /** CATALOG-MAIN-PHOTO: выбранное главное фото карточки каталога (id работы портфолио). */
  catalogCoverAssetId: string | null;
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
    value === "profile" ||
    value === "portfolio" ||
    value === "owner-team" ||
    value === "notifications" ||
    value === "policy" ||
    value === "danger"
  );
}

/** `?section=` → раздел: текущие ключи, легаси-псевдонимы, иначе дефолт. */
export function resolveStudioSettingsSection(value: unknown): StudioSettingsSection {
  if (isStudioSettingsSection(value)) return value;
  if (typeof value === "string" && value in LEGACY_SECTION_ALIASES) {
    return LEGACY_SECTION_ALIASES[value];
  }
  return DEFAULT_STUDIO_SETTINGS_SECTION;
}
