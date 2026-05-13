import { NotificationType, type ProviderType } from "@prisma/client";
import {
  classifyNotificationChannel,
  resolveModelChannel,
  type NotificationChannel,
} from "@/lib/notifications/center";

/**
 * Notification grouping for the cabinet split (26-NOTIF-A).
 *
 * The cabinet has two surfaces:
 *   - `/cabinet/master/notifications` — operational events for a master
 *     (new bookings, reviews, chat replies, hot-slot status, etc.).
 *   - `/notifications` — the personal/account stream (booking confirmations
 *     the user receives as a client, billing, security, studio invites).
 *
 * One `NotificationType` is not enough for routing: types like
 * `BOOKING_REMINDER_24H` are sent to **both** the master and the client of
 * the same booking, and only the booking's ownership tells us who the
 * recipient is. We therefore use two layers:
 *
 *   1. **SQL allowlist** by type — `MASTER_NOTIFICATION_TYPES`. Cheap
 *      pre-filter that excludes types we know are never master-context.
 *      Used for badge counts where slight over-counting is acceptable.
 *   2. **Per-notification classifier** via `classifyNotificationChannel`
 *      from `center.ts` — looks at the related booking to decide if the
 *      user is the master or the client. Used for the listing query so
 *      ambiguous types are resolved correctly.
 *
 * `BILLING_*` lives in personal: a master with a separate `/cabinet/billing`
 * surface should not see "trial expiring" mixed with "new booking from
 * Maria". `MASTER_CABINET_DELETED` lives in personal so it survives the
 * cabinet being gone (otherwise the user could never see it).
 */

/**
 * Types that can appear with `channel === "MASTER"` after per-notification
 * classification. Some are unambiguous (`BOOKING_REQUEST` is always for a
 * master); some are ambiguous and require booking ownership (`BOOKING_REMINDER_*`,
 * `CHAT_MESSAGE_RECEIVED`, `BOOKING_RESCHEDULED`, etc.) — those still pass
 * this allowlist so they survive the SQL pre-filter, then `isMasterNotification`
 * applies the precise classifier.
 */
export const MASTER_NOTIFICATION_TYPES: NotificationType[] = [
  // Bookings — master side
  NotificationType.BOOKING_REQUEST,
  NotificationType.BOOKING_CREATED,
  NotificationType.BOOKING_CANCELLED_BY_CLIENT,
  NotificationType.BOOKING_RESCHEDULED, // ambiguous
  NotificationType.BOOKING_RESCHEDULE_REQUESTED,
  NotificationType.BOOKING_REMINDER_24H, // ambiguous
  NotificationType.BOOKING_REMINDER_2H, // ambiguous
  NotificationType.BOOKING_COMPLETED_REVIEW,
  NotificationType.BOOKING_NO_SHOW,
  // Reviews
  NotificationType.REVIEW_LEFT,
  NotificationType.REVIEW_REPLIED, // ambiguous
  // Model offers — master side
  NotificationType.MODEL_NEW_APPLICATION,
  NotificationType.MODEL_APPLICATION_RECEIVED,
  NotificationType.MODEL_BOOKING_CREATED,
  NotificationType.MODEL_TIME_CONFIRMED,
  // Hot slots — master side
  NotificationType.HOT_SLOT_BOOKED,
  NotificationType.HOT_SLOT_EXPIRING,
  NotificationType.HOT_SLOT_PUBLISHED,
  // Stats
  NotificationType.MASTER_WEEKLY_STATS,
  // Chat — ambiguous; classifier filters by sender role
  NotificationType.CHAT_MESSAGE_RECEIVED,
  // Categories — master submitted them
  NotificationType.CATEGORY_APPROVED,
  NotificationType.CATEGORY_REJECTED,
];

/**
 * Types that **never** appear in the master surface, regardless of
 * booking ownership. Anything not in `MASTER_NOTIFICATION_TYPES` is by
 * definition personal-only; this constant is exposed for clarity and unit
 * testing — it should always be the complement set.
 */
export const PERSONAL_ONLY_TYPES: NotificationType[] = [
  // Bookings — client side
  NotificationType.BOOKING_CONFIRMED,
  NotificationType.BOOKING_CANCELLED,
  NotificationType.BOOKING_CANCELLED_BY_MASTER,
  NotificationType.BOOKING_DECLINED,
  NotificationType.BOOKING_REJECTED,
  // Studio events (out of scope for master surface; surfaced via
  // /notifications and future studio cabinet)
  NotificationType.STUDIO_INVITE_RECEIVED,
  NotificationType.STUDIO_INVITE_ACCEPTED,
  NotificationType.STUDIO_INVITE_REJECTED,
  NotificationType.STUDIO_MEMBER_LEFT,
  NotificationType.STUDIO_SCHEDULE_REQUEST,
  NotificationType.STUDIO_SCHEDULE_APPROVED,
  NotificationType.STUDIO_SCHEDULE_REJECTED,
  NotificationType.STUDIO_DISBANDED,
  // Master cabinet deletion — kept personal so user still sees it after
  // the cabinet is gone (master surface itself becomes inaccessible).
  NotificationType.MASTER_CABINET_DELETED,
  // Model offers — client side
  NotificationType.MODEL_APPLICATION_REJECTED,
  NotificationType.MODEL_TIME_PROPOSED,
  // Hot slots — client subscriber side
  NotificationType.HOT_SLOT_AVAILABLE,
  NotificationType.SLOT_FREED,
  // Billing — account-level, dedicated /cabinet/billing surface
  NotificationType.BILLING_PAYMENT_SUCCEEDED,
  NotificationType.BILLING_PAYMENT_FAILED,
  NotificationType.BILLING_RENEWAL_CONFIRMATION_REQUIRED,
  NotificationType.BILLING_SUBSCRIPTION_CANCELLED,
  NotificationType.BILLING_SUBSCRIPTION_EXPIRED,
  NotificationType.BILLING_TRIAL_ENDING_SOON,
  NotificationType.BILLING_TRIAL_EXPIRED,
  // Admin-initiated billing notifications — personal-only (live next to
  // their regular `BILLING_*` siblings on the user's billing surface).
  NotificationType.BILLING_PLAN_GRANTED_BY_ADMIN,
  NotificationType.BILLING_PLAN_EDITED,
  NotificationType.BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN,
  NotificationType.BILLING_PAYMENT_REFUNDED,
  NotificationType.SUBSCRIPTION_GRANTED_BY_ADMIN,
  // Review removal notice — recipient is the review author (client side).
  NotificationType.REVIEW_DELETED_BY_ADMIN,
];

export type NotificationContext = "master" | "personal" | "all";

/**
 * Per-notification classification combining type allowlist + booking
 * ownership. Mirrors the channel hierarchy used by `getNotificationCenterData`
 * so list/badge/center stay consistent.
 *
 * Returns true when the notification belongs to the master's operational
 * stream:
 *   - Type is in `MASTER_NOTIFICATION_TYPES` AND
 *   - Resolved channel === "MASTER" (booking owned by user as master, or
 *     a model-channel mapping that lands on master).
 */
export function isMasterNotification(input: {
  type: NotificationType;
  userId: string;
  studioIds: Set<string>;
  booking: {
    studioId: string | null;
    provider: { type: ProviderType; ownerUserId: string | null };
    masterProvider: { ownerUserId: string | null } | null;
  } | null;
}): boolean {
  if (!MASTER_NOTIFICATION_TYPES.includes(input.type)) return false;

  const modelChannel = resolveModelChannel(input.type);
  if (modelChannel) return modelChannel === "MASTER";

  // STUDIO_* types are excluded by the allowlist, but defend in depth so
  // a future master allowlist tweak can't accidentally surface them.
  if (input.type.startsWith("STUDIO_")) return false;

  const channel: NotificationChannel = classifyNotificationChannel({
    userId: input.userId,
    studioIds: input.studioIds,
    booking: input.booking,
  });
  return channel === "MASTER";
}
