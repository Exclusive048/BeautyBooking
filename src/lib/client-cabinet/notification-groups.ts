import { NotificationType } from "@prisma/client";

export type ClientNotificationGroup =
  | "bookings"
  | "reminders"
  | "reviews"
  | "promo"
  | "system";

const GROUP_MAP: Record<NotificationType, ClientNotificationGroup> = {
  BOOKING_CREATED: "bookings",
  BOOKING_CANCELLED: "bookings",
  BOOKING_CANCELLED_BY_MASTER: "bookings",
  BOOKING_CANCELLED_BY_CLIENT: "bookings",
  BOOKING_RESCHEDULED: "bookings",
  BOOKING_RESCHEDULE_REQUESTED: "bookings",
  BOOKING_REQUEST: "bookings",
  BOOKING_CONFIRMED: "bookings",
  BOOKING_DECLINED: "bookings",
  BOOKING_REJECTED: "bookings",
  BOOKING_COMPLETED_REVIEW: "reviews",
  BOOKING_NO_SHOW: "bookings",
  BOOKING_REMINDER_24H: "reminders",
  BOOKING_REMINDER_2H: "reminders",
  REVIEW_LEFT: "reviews",
  REVIEW_REPLIED: "reviews",
  STUDIO_INVITE_RECEIVED: "system",
  STUDIO_INVITE_ACCEPTED: "system",
  STUDIO_INVITE_REJECTED: "system",
  STUDIO_MEMBER_LEFT: "system",
  STUDIO_SCHEDULE_REQUEST: "system",
  STUDIO_SCHEDULE_APPROVED: "system",
  STUDIO_SCHEDULE_REJECTED: "system",
  STUDIO_DISBANDED: "system",
  MASTER_CABINET_DELETED: "system",
  MODEL_NEW_APPLICATION: "system",
  MODEL_APPLICATION_RECEIVED: "system",
  MODEL_APPLICATION_REJECTED: "system",
  MODEL_TIME_PROPOSED: "system",
  MODEL_BOOKING_CREATED: "bookings",
  MODEL_TIME_CONFIRMED: "bookings",
  HOT_SLOT_AVAILABLE: "promo",
  SLOT_FREED: "promo",
  HOT_SLOT_PUBLISHED: "promo",
  HOT_SLOT_BOOKED: "bookings",
  HOT_SLOT_EXPIRING: "promo",
  MASTER_WEEKLY_STATS: "system",
  BILLING_PAYMENT_SUCCEEDED: "system",
  BILLING_PAYMENT_FAILED: "system",
  BILLING_RENEWAL_CONFIRMATION_REQUIRED: "system",
  BILLING_SUBSCRIPTION_CANCELLED: "system",
  BILLING_SUBSCRIPTION_EXPIRED: "system",
  BILLING_TRIAL_ENDING_SOON: "system",
  BILLING_TRIAL_EXPIRED: "system",
  CHAT_MESSAGE_RECEIVED: "system",
  CATEGORY_APPROVED: "system",
  CATEGORY_REJECTED: "system",
};

export function groupForNotificationType(
  type: NotificationType,
): ClientNotificationGroup {
  return GROUP_MAP[type] ?? "system";
}
