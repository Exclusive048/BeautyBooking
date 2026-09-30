/**
 * PERF-11 — значения Prisma-enum'ов для КЛИЕНТСКОГО кода.
 *
 * Зачем отдельный модуль. `import { BookingStatus } from "@prisma/client"` —
 * **value**-импорт, и он затаскивает в браузерный бандл рантайм Prisma
 * (`index-browser.js`, ~66 kB parsed / 21 kB gzip). `serverExternalPackages`
 * в `next.config.ts` от этого не спасает — тот список действует только на
 * серверный граф. Билд при этом остаётся зелёным: вес просто появляется молча,
 * поэтому пятнадцать компонентов и прожили с таким импортом.
 *
 * Здесь — те же значения обычными const-объектами, БЕЗ рантайм-зависимости:
 * `import type { $Enums }` компилятор стирает целиком.
 *
 * Дрейф со схемой невозможен молча: `satisfies EnumMirror<$Enums.X>` требует
 * ВСЕ члены enum'а и запрещает лишние — добавили значение в `prisma/schema`,
 * не добавили сюда → красный `typecheck`. Второй слой (сравнение с рантаймом
 * Prisma) — в `prisma-enums.test.ts`, там же guard, что клиентский граф не
 * импортирует `@prisma/client` значением.
 *
 * ⚠️ В этом файле НЕЛЬЗЯ появиться value-импорту из `@prisma/client` — это
 * вернуло бы ровно ту зависимость, ради устранения которой модуль и заведён.
 *
 * Типы по-прежнему берутся из `@prisma/client` через `import type` — дублировать
 * их здесь не нужно, они и так стираются.
 */
import type { $Enums } from "@prisma/client";

/** Ключ равен значению — ровно форма, в которой Prisma генерирует enum-объект. */
type EnumMirror<T extends string> = { readonly [K in T]: K };

export const AccountType = {
  CLIENT: "CLIENT",
  MASTER: "MASTER",
  STUDIO: "STUDIO",
  STUDIO_ADMIN: "STUDIO_ADMIN",
  ADMIN: "ADMIN",
  SUPERADMIN: "SUPERADMIN",
} as const satisfies EnumMirror<$Enums.AccountType>;
export type AccountType = $Enums.AccountType;

export const BillingPaymentStatus = {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  CANCELED: "CANCELED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const satisfies EnumMirror<$Enums.BillingPaymentStatus>;
export type BillingPaymentStatus = $Enums.BillingPaymentStatus;

export const BookingSource = {
  MANUAL: "MANUAL",
  WEB: "WEB",
  APP: "APP",
} as const satisfies EnumMirror<$Enums.BookingSource>;
export type BookingSource = $Enums.BookingSource;

export const BookingStatus = {
  NEW: "NEW",
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CHANGE_REQUESTED: "CHANGE_REQUESTED",
  REJECTED: "REJECTED",
  IN_PROGRESS: "IN_PROGRESS",
  PREPAID: "PREPAID",
  STARTED: "STARTED",
  FINISHED: "FINISHED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const satisfies EnumMirror<$Enums.BookingStatus>;
export type BookingStatus = $Enums.BookingStatus;

export const DiscountType = {
  PERCENT: "PERCENT",
  FIXED: "FIXED",
} as const satisfies EnumMirror<$Enums.DiscountType>;
export type DiscountType = $Enums.DiscountType;

export const MediaEntityType = {
  USER: "USER",
  MASTER: "MASTER",
  STUDIO: "STUDIO",
  SITE: "SITE",
  MODEL_APPLICATION: "MODEL_APPLICATION",
  CLIENT_CARD: "CLIENT_CARD",
  BOOKING: "BOOKING",
  CHAT_MESSAGE: "CHAT_MESSAGE",
} as const satisfies EnumMirror<$Enums.MediaEntityType>;
export type MediaEntityType = $Enums.MediaEntityType;

export const NotificationType = {
  BOOKING_CREATED: "BOOKING_CREATED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  BOOKING_CANCELLED_BY_MASTER: "BOOKING_CANCELLED_BY_MASTER",
  BOOKING_CANCELLED_BY_CLIENT: "BOOKING_CANCELLED_BY_CLIENT",
  BOOKING_RESCHEDULED: "BOOKING_RESCHEDULED",
  BOOKING_RESCHEDULE_REQUESTED: "BOOKING_RESCHEDULE_REQUESTED",
  BOOKING_REQUEST: "BOOKING_REQUEST",
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_DECLINED: "BOOKING_DECLINED",
  BOOKING_REJECTED: "BOOKING_REJECTED",
  BOOKING_REMINDER_24H: "BOOKING_REMINDER_24H",
  BOOKING_REMINDER_2H: "BOOKING_REMINDER_2H",
  BOOKING_COMPLETED_REVIEW: "BOOKING_COMPLETED_REVIEW",
  BOOKING_NO_SHOW: "BOOKING_NO_SHOW",
  REVIEW_LEFT: "REVIEW_LEFT",
  REVIEW_REPLIED: "REVIEW_REPLIED",
  STUDIO_INVITE_RECEIVED: "STUDIO_INVITE_RECEIVED",
  STUDIO_INVITE_ACCEPTED: "STUDIO_INVITE_ACCEPTED",
  STUDIO_INVITE_REJECTED: "STUDIO_INVITE_REJECTED",
  STUDIO_MEMBER_LEFT: "STUDIO_MEMBER_LEFT",
  STUDIO_MEMBER_REMOVED: "STUDIO_MEMBER_REMOVED",
  STUDIO_SCHEDULE_REQUEST: "STUDIO_SCHEDULE_REQUEST",
  STUDIO_SCHEDULE_APPROVED: "STUDIO_SCHEDULE_APPROVED",
  STUDIO_SCHEDULE_REJECTED: "STUDIO_SCHEDULE_REJECTED",
  STUDIO_DISBANDED: "STUDIO_DISBANDED",
  STUDIO_SCHEDULE_ENDING: "STUDIO_SCHEDULE_ENDING",
  MASTER_CABINET_DELETED: "MASTER_CABINET_DELETED",
  MODEL_NEW_APPLICATION: "MODEL_NEW_APPLICATION",
  MODEL_APPLICATION_RECEIVED: "MODEL_APPLICATION_RECEIVED",
  MODEL_APPLICATION_REJECTED: "MODEL_APPLICATION_REJECTED",
  MODEL_TIME_PROPOSED: "MODEL_TIME_PROPOSED",
  MODEL_BOOKING_CREATED: "MODEL_BOOKING_CREATED",
  MODEL_TIME_CONFIRMED: "MODEL_TIME_CONFIRMED",
  HOT_SLOT_AVAILABLE: "HOT_SLOT_AVAILABLE",
  SLOT_FREED: "SLOT_FREED",
  HOT_SLOT_PUBLISHED: "HOT_SLOT_PUBLISHED",
  HOT_SLOT_BOOKED: "HOT_SLOT_BOOKED",
  HOT_SLOT_EXPIRING: "HOT_SLOT_EXPIRING",
  MASTER_WEEKLY_STATS: "MASTER_WEEKLY_STATS",
  BILLING_PAYMENT_SUCCEEDED: "BILLING_PAYMENT_SUCCEEDED",
  BILLING_PAYMENT_FAILED: "BILLING_PAYMENT_FAILED",
  BILLING_RENEWAL_CONFIRMATION_REQUIRED: "BILLING_RENEWAL_CONFIRMATION_REQUIRED",
  BILLING_RENEWAL_PRICE_INCREASE: "BILLING_RENEWAL_PRICE_INCREASE",
  BILLING_SUBSCRIPTION_CANCELLED: "BILLING_SUBSCRIPTION_CANCELLED",
  BILLING_SUBSCRIPTION_EXPIRED: "BILLING_SUBSCRIPTION_EXPIRED",
  BILLING_TRIAL_ENDING_SOON: "BILLING_TRIAL_ENDING_SOON",
  BILLING_TRIAL_EXPIRED: "BILLING_TRIAL_EXPIRED",
  CHAT_MESSAGE_RECEIVED: "CHAT_MESSAGE_RECEIVED",
  CATEGORY_APPROVED: "CATEGORY_APPROVED",
  CATEGORY_REJECTED: "CATEGORY_REJECTED",
  BILLING_PLAN_GRANTED_BY_ADMIN: "BILLING_PLAN_GRANTED_BY_ADMIN",
  BILLING_PLAN_EDITED: "BILLING_PLAN_EDITED",
  BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN: "BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN",
  BILLING_PAYMENT_REFUNDED: "BILLING_PAYMENT_REFUNDED",
  REVIEW_DELETED_BY_ADMIN: "REVIEW_DELETED_BY_ADMIN",
  SUBSCRIPTION_GRANTED_BY_ADMIN: "SUBSCRIPTION_GRANTED_BY_ADMIN",
  SCHEDULE_ENDING: "SCHEDULE_ENDING",
} as const satisfies EnumMirror<$Enums.NotificationType>;
export type NotificationType = $Enums.NotificationType;

export const PlanTier = {
  FREE: "FREE",
  PRO: "PRO",
  PREMIUM: "PREMIUM",
} as const satisfies EnumMirror<$Enums.PlanTier>;
export type PlanTier = $Enums.PlanTier;

export const ProviderType = {
  MASTER: "MASTER",
  STUDIO: "STUDIO",
} as const satisfies EnumMirror<$Enums.ProviderType>;
export type ProviderType = $Enums.ProviderType;

export const ReviewReportReason = {
  SPAM: "SPAM",
  FAKE: "FAKE",
  OFFENSIVE: "OFFENSIVE",
  INAPPROPRIATE: "INAPPROPRIATE",
  OTHER: "OTHER",
} as const satisfies EnumMirror<$Enums.ReviewReportReason>;
export type ReviewReportReason = $Enums.ReviewReportReason;

export const ReviewTargetType = {
  provider: "provider",
  studio: "studio",
} as const satisfies EnumMirror<$Enums.ReviewTargetType>;
export type ReviewTargetType = $Enums.ReviewTargetType;

export const ScheduleChangeRequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const satisfies EnumMirror<$Enums.ScheduleChangeRequestStatus>;
export type ScheduleChangeRequestStatus = $Enums.ScheduleChangeRequestStatus;

export const SubscriptionScope = {
  MASTER: "MASTER",
  STUDIO: "STUDIO",
} as const satisfies EnumMirror<$Enums.SubscriptionScope>;
export type SubscriptionScope = $Enums.SubscriptionScope;

export const SubscriptionStatus = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  PAST_DUE: "PAST_DUE",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const satisfies EnumMirror<$Enums.SubscriptionStatus>;
export type SubscriptionStatus = $Enums.SubscriptionStatus;
