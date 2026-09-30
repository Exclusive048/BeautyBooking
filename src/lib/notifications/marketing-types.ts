import type { NotificationType } from "@prisma/client";

/**
 * 29.09 доработки · 16 (ENFORCEMENT: ConsentType.MARKETING) — назначение
 * каждого типа уведомления: сервисное (ответ на действие человека, его запись,
 * его кабинет) или рекламное (38-ФЗ ст. 18 ч. 1 — реклама по сетям связи только
 * с предварительного согласия).
 *
 * Рекламный тип без активного согласия `MARKETING` не создаётся ни в одном
 * канале — проверка в `deliverNotification` (`notifications/delivery.ts`).
 * Полнота — на компиляторе: `Record<NotificationType, …>`, и новый тип в
 * `enums.prisma` без классификации не собирается (как DMMF-сторожа #35/#38,
 * только сильнее — ошибка `typecheck`, а не красный тест).
 */
export type NotificationPurpose = "service" | "marketing";

/**
 * Рекламные типы — с причиной (решение владельца 29.09, вопрос Ю1, вариант В).
 */
export const MARKETING_NOTIFICATION_TYPES = {
  HOT_SLOT_AVAILABLE:
    "«горящее окошко со скидкой» мастера, на которого человек подписан: скидку наши же документы называют акцией " +
    "(/consent §7) — нужно и согласие на рекламу (Ю1, вариант В)",
} as const satisfies Partial<Record<NotificationType, string>>;

export type MarketingNotificationType = keyof typeof MARKETING_NOTIFICATION_TYPES;

/**
 * Назначение каждого типа. `SLOT_FREED` («окошко освободилось», без скидки) —
 * сервисное: это ответ на явную подписку человека (Ю1, вариант В).
 * `HOT_SLOT_PUBLISHED` / `HOT_SLOT_EXPIRING` — мастеру о его СОБСТВЕННЫХ
 * окошках, сервисные, хотя в кабинете клиента и лежат в группе «Акции».
 */
export const NOTIFICATION_TYPE_PURPOSE = {
  BOOKING_CREATED: "service",
  BOOKING_CANCELLED: "service",
  BOOKING_CANCELLED_BY_MASTER: "service",
  BOOKING_CANCELLED_BY_CLIENT: "service",
  BOOKING_RESCHEDULED: "service",
  BOOKING_RESCHEDULE_REQUESTED: "service",
  BOOKING_REQUEST: "service",
  BOOKING_CONFIRMED: "service",
  BOOKING_DECLINED: "service",
  BOOKING_REJECTED: "service",
  BOOKING_REMINDER_24H: "service",
  BOOKING_REMINDER_2H: "service",
  BOOKING_COMPLETED_REVIEW: "service",
  BOOKING_NO_SHOW: "service",
  REVIEW_LEFT: "service",
  REVIEW_REPLIED: "service",
  STUDIO_INVITE_RECEIVED: "service",
  STUDIO_INVITE_ACCEPTED: "service",
  STUDIO_INVITE_REJECTED: "service",
  STUDIO_MEMBER_LEFT: "service",
  STUDIO_MEMBER_REMOVED: "service",
  STUDIO_SCHEDULE_REQUEST: "service",
  STUDIO_SCHEDULE_APPROVED: "service",
  STUDIO_SCHEDULE_REJECTED: "service",
  STUDIO_DISBANDED: "service",
  STUDIO_SCHEDULE_ENDING: "service",
  MASTER_CABINET_DELETED: "service",
  MODEL_NEW_APPLICATION: "service",
  MODEL_APPLICATION_RECEIVED: "service",
  MODEL_APPLICATION_REJECTED: "service",
  MODEL_TIME_PROPOSED: "service",
  MODEL_BOOKING_CREATED: "service",
  MODEL_TIME_CONFIRMED: "service",
  HOT_SLOT_AVAILABLE: "marketing",
  SLOT_FREED: "service",
  HOT_SLOT_PUBLISHED: "service",
  HOT_SLOT_BOOKED: "service",
  HOT_SLOT_EXPIRING: "service",
  MASTER_WEEKLY_STATS: "service",
  BILLING_PAYMENT_SUCCEEDED: "service",
  BILLING_PAYMENT_FAILED: "service",
  BILLING_RENEWAL_CONFIRMATION_REQUIRED: "service",
  BILLING_RENEWAL_PRICE_INCREASE: "service",
  BILLING_SUBSCRIPTION_CANCELLED: "service",
  BILLING_SUBSCRIPTION_EXPIRED: "service",
  BILLING_TRIAL_ENDING_SOON: "service",
  BILLING_TRIAL_EXPIRED: "service",
  CHAT_MESSAGE_RECEIVED: "service",
  CATEGORY_APPROVED: "service",
  CATEGORY_REJECTED: "service",
  BILLING_PLAN_GRANTED_BY_ADMIN: "service",
  BILLING_PLAN_EDITED: "service",
  BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN: "service",
  BILLING_PAYMENT_REFUNDED: "service",
  REVIEW_DELETED_BY_ADMIN: "service",
  SUBSCRIPTION_GRANTED_BY_ADMIN: "service",
  SCHEDULE_ENDING: "service",
} as const satisfies Record<NotificationType, NotificationPurpose>;

export function isMarketingNotificationType(type: NotificationType): type is MarketingNotificationType {
  return NOTIFICATION_TYPE_PURPOSE[type] === "marketing";
}
