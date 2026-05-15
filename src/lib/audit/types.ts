import { AdminAuditAction } from "@prisma/client";
import type { AdminAuditLog } from "@prisma/client";

export { AdminAuditAction };
export type { AdminAuditLog };

/** Structured payload stored in `AdminAuditLog.details`. The shape is
 * enforced at the call site, not in the DB. Callers should pick the
 * smallest subset they need — `diff` is the canonical shape for
 * state-mutation events, free-form fields are reserved for
 * action-specific context (plan code, flag key, refund amount, etc.). */
export type AdminAuditDetails = {
  diff?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  [key: string]: unknown;
};

/** Const map mirroring `AdminAuditAction` enum values. Lets call sites
 * reference actions via `ADMIN_AUDIT_ACTIONS.X` for IDE autocomplete
 * without importing the runtime enum. The `satisfies` clause forces
 * the object to stay exhaustive — drop or rename an enum value and
 * the project stops type-checking until this list is updated. */
export const ADMIN_AUDIT_ACTIONS = {
  USER_PLAN_GRANTED: AdminAuditAction.USER_PLAN_GRANTED,
  USER_BLOCKED: AdminAuditAction.USER_BLOCKED,
  USER_UNBLOCKED: AdminAuditAction.USER_UNBLOCKED,
  USER_ROLE_ADDED: AdminAuditAction.USER_ROLE_ADDED,
  USER_ROLE_REMOVED: AdminAuditAction.USER_ROLE_REMOVED,
  USER_ACCOUNT_DELETED: AdminAuditAction.USER_ACCOUNT_DELETED,

  BILLING_PLAN_EDITED: AdminAuditAction.BILLING_PLAN_EDITED,
  BILLING_SUBSCRIPTION_CANCELLED: AdminAuditAction.BILLING_SUBSCRIPTION_CANCELLED,
  BILLING_PAYMENT_REFUNDED: AdminAuditAction.BILLING_PAYMENT_REFUNDED,

  CITY_CREATED: AdminAuditAction.CITY_CREATED,
  CITY_UPDATED: AdminAuditAction.CITY_UPDATED,
  CITY_DELETED: AdminAuditAction.CITY_DELETED,
  CITY_MERGED: AdminAuditAction.CITY_MERGED,
  CITY_VERIFIED: AdminAuditAction.CITY_VERIFIED,

  CATEGORY_APPROVED: AdminAuditAction.CATEGORY_APPROVED,
  CATEGORY_REJECTED: AdminAuditAction.CATEGORY_REJECTED,
  CATEGORY_EDITED: AdminAuditAction.CATEGORY_EDITED,

  REVIEW_APPROVED: AdminAuditAction.REVIEW_APPROVED,
  REVIEW_DELETED: AdminAuditAction.REVIEW_DELETED,
  REVIEW_RESTORED: AdminAuditAction.REVIEW_RESTORED,

  SETTINGS_LOGO_UPDATED: AdminAuditAction.SETTINGS_LOGO_UPDATED,
  SETTINGS_LOGIN_HERO_UPDATED: AdminAuditAction.SETTINGS_LOGIN_HERO_UPDATED,
  SETTINGS_SEO_UPDATED: AdminAuditAction.SETTINGS_SEO_UPDATED,
  SETTINGS_FLAG_TOGGLED: AdminAuditAction.SETTINGS_FLAG_TOGGLED,
  SETTINGS_APP_SETTING_UPDATED: AdminAuditAction.SETTINGS_APP_SETTING_UPDATED,
} as const satisfies Record<AdminAuditAction, AdminAuditAction>;
