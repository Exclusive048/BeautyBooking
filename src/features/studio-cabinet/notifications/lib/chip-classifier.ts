import { NotificationType } from "@prisma/client";
import type { StudioNotificationChip } from "./types";

/**
 * Studio chip bucket classifier — wider than master's `classifyTabBucket`
 * because studio scope adds Team (STUDIO_*) + Finance (BILLING_*) and
 * splits booking/cancel/reschedule more granularly.
 *
 * Mapping informed by the full NotificationType enum (see
 * `prisma/schema/enums.prisma`). Unknown types fall through to "system"
 * so the chip total always matches the table total. No "cabinets" chip —
 * no cabinet model exists in the schema.
 */
export function classifyStudioChip(
  type: NotificationType | "SCHEDULE_REQUEST",
): Exclude<StudioNotificationChip, "all" | "unread"> {
  if (type === "SCHEDULE_REQUEST") return "team";

  switch (type) {
    // Bookings: created / confirmed / reminders / completed
    case NotificationType.BOOKING_CREATED:
    case NotificationType.BOOKING_REQUEST:
    case NotificationType.BOOKING_CONFIRMED:
    case NotificationType.BOOKING_REMINDER_24H:
    case NotificationType.BOOKING_REMINDER_2H:
    case NotificationType.BOOKING_COMPLETED_REVIEW:
    case NotificationType.MODEL_NEW_APPLICATION:
    case NotificationType.MODEL_APPLICATION_RECEIVED:
    case NotificationType.MODEL_BOOKING_CREATED:
    case NotificationType.HOT_SLOT_BOOKED:
      return "bookings";

    // Cancellations + no-show + rejections
    case NotificationType.BOOKING_CANCELLED:
    case NotificationType.BOOKING_CANCELLED_BY_CLIENT:
    case NotificationType.BOOKING_CANCELLED_BY_MASTER:
    case NotificationType.BOOKING_DECLINED:
    case NotificationType.BOOKING_REJECTED:
    case NotificationType.BOOKING_NO_SHOW:
    case NotificationType.MODEL_APPLICATION_REJECTED:
      return "cancellations";

    // Reschedules + change requests
    case NotificationType.BOOKING_RESCHEDULED:
    case NotificationType.BOOKING_RESCHEDULE_REQUESTED:
    case NotificationType.MODEL_TIME_PROPOSED:
    case NotificationType.MODEL_TIME_CONFIRMED:
      return "reschedules";

    // Reviews
    case NotificationType.REVIEW_LEFT:
    case NotificationType.REVIEW_REPLIED:
    case NotificationType.REVIEW_DELETED_BY_ADMIN:
      return "reviews";

    // Chat
    case NotificationType.CHAT_MESSAGE_RECEIVED:
      return "messages";

    // Team / studio membership / schedule requests
    case NotificationType.STUDIO_INVITE_RECEIVED:
    case NotificationType.STUDIO_INVITE_ACCEPTED:
    case NotificationType.STUDIO_INVITE_REJECTED:
    case NotificationType.STUDIO_MEMBER_LEFT:
    case NotificationType.STUDIO_MEMBER_REMOVED:
    case NotificationType.STUDIO_SCHEDULE_REQUEST:
    case NotificationType.STUDIO_SCHEDULE_APPROVED:
    case NotificationType.STUDIO_SCHEDULE_REJECTED:
    case NotificationType.STUDIO_DISBANDED:
    case NotificationType.STUDIO_SCHEDULE_ENDING:
      return "team";

    // Finance / billing
    case NotificationType.BILLING_PAYMENT_SUCCEEDED:
    case NotificationType.BILLING_PAYMENT_FAILED:
    case NotificationType.BILLING_RENEWAL_CONFIRMATION_REQUIRED:
    case NotificationType.BILLING_SUBSCRIPTION_CANCELLED:
    case NotificationType.BILLING_SUBSCRIPTION_EXPIRED:
    case NotificationType.BILLING_TRIAL_ENDING_SOON:
    case NotificationType.BILLING_TRIAL_EXPIRED:
    case NotificationType.BILLING_PLAN_GRANTED_BY_ADMIN:
    case NotificationType.BILLING_PLAN_EDITED:
    case NotificationType.BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN:
    case NotificationType.BILLING_PAYMENT_REFUNDED:
    case NotificationType.SUBSCRIPTION_GRANTED_BY_ADMIN:
      return "finance";

    default:
      return "system";
  }
}
