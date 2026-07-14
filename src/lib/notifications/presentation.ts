import { billingUpgradeHref } from "@/lib/billing/upgrade-href";
import { toLocalDateKey } from "@/lib/schedule/timezone";

type NotificationPresentation = {
  showToast: boolean;
  toastDurationMs: number;
  maxVisibleToasts: number;
  dedupeWindowMs: number;
};

const DEFAULT_PRESENTATION: NotificationPresentation = {
  showToast: true,
  toastDurationMs: 12000,
  maxVisibleToasts: 4,
  dedupeWindowMs: 5 * 60 * 1000,
};

const BY_TYPE: Record<string, Partial<NotificationPresentation>> = {
  BOOKING_REQUEST: { toastDurationMs: 15000 },
  BOOKING_CREATED: { toastDurationMs: 15000 },
  BOOKING_CANCELLED: { toastDurationMs: 15000 },
  BOOKING_CANCELLED_BY_MASTER: { toastDurationMs: 15000 },
  BOOKING_CANCELLED_BY_CLIENT: { toastDurationMs: 15000 },
  BOOKING_RESCHEDULED: { toastDurationMs: 15000 },
  BOOKING_RESCHEDULE_REQUESTED: { toastDurationMs: 15000 },
  CHAT_MESSAGE_RECEIVED: { toastDurationMs: 15000 },
  STUDIO_INVITE_RECEIVED: { toastDurationMs: 15000 },
  STUDIO_INVITE_ACCEPTED: { toastDurationMs: 15000 },
  STUDIO_INVITE_REJECTED: { toastDurationMs: 15000 },
  STUDIO_INVITE_REVOKED: { toastDurationMs: 15000 },
  SLOT_FREED: { toastDurationMs: 15000 },
  MASTER_WEEKLY_STATS: { toastDurationMs: 12000 },
};

const BOOKING_ACTION_TYPES = new Set<string>(["BOOKING_CREATED", "BOOKING_REQUEST"]);
const INVITE_REFRESH_EVENT_TYPES = new Set<string>(["STUDIO_INVITE_RECEIVED", "STUDIO_INVITE_REVOKED"]);
const BOOKING_MASTER_HREF_TYPES = new Set<string>([
  "BOOKING_CREATED",
  "BOOKING_REQUEST",
  "BOOKING_CANCELLED_BY_CLIENT",
  "BOOKING_RESCHEDULE_REQUESTED",
  "BOOKING_NO_SHOW",
]);
const BOOKING_CLIENT_HREF_TYPES = new Set<string>([
  "BOOKING_CANCELLED",
  "BOOKING_CANCELLED_BY_MASTER",
  "BOOKING_RESCHEDULED",
  "BOOKING_CONFIRMED",
  "BOOKING_REJECTED",
  "BOOKING_DECLINED",
  "BOOKING_REMINDER_24H",
  "BOOKING_REMINDER_2H",
  "BOOKING_COMPLETED_REVIEW",
]);

export function getNotificationPresentation(type: string): NotificationPresentation {
  const override = BY_TYPE[type] ?? {};
  return {
    showToast: override.showToast ?? DEFAULT_PRESENTATION.showToast,
    toastDurationMs: override.toastDurationMs ?? DEFAULT_PRESENTATION.toastDurationMs,
    maxVisibleToasts: override.maxVisibleToasts ?? DEFAULT_PRESENTATION.maxVisibleToasts,
    dedupeWindowMs: override.dedupeWindowMs ?? DEFAULT_PRESENTATION.dedupeWindowMs,
  };
}

export function isBookingActionNotification(type: string): boolean {
  return BOOKING_ACTION_TYPES.has(type);
}

export function shouldRefreshInvitesForEvent(type: string): boolean {
  return INVITE_REFRESH_EVENT_TYPES.has(type);
}

type BookingPayload = {
  bookingId?: unknown;
  providerType?: unknown;
  startAtUtc?: unknown;
  providerTimezone?: unknown;
};

function parsePayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as Record<string, unknown>;
  return null;
}

function parseBookingPayload(payload: unknown): {
  bookingId: string;
  providerType?: "MASTER" | "STUDIO";
  startAtUtc?: string;
  providerTimezone?: string;
} | null {
  const record = parsePayloadRecord(payload) as BookingPayload | null;
  if (!record) return null;
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
  const providerType =
    record.providerType === "MASTER" || record.providerType === "STUDIO"
      ? record.providerType
      : undefined;
  const startAtUtc =
    typeof record.startAtUtc === "string" && record.startAtUtc.length > 0
      ? record.startAtUtc
      : undefined;
  const providerTimezone =
    typeof record.providerTimezone === "string" && record.providerTimezone.length > 0
      ? record.providerTimezone
      : undefined;
  return { bookingId: record.bookingId, providerType, startAtUtc, providerTimezone };
}

/**
 * BOOKING-STUDIO-RESCHEDULE-PARITY-01: studio booking notifications deep-link to
 * the calendar landing on the exact booking. `?date=<salon-day>` loads the right
 * day (computed in the SALON tz — `providerTimezone` in the payload — so a
 * cross-tz admin lands on the salon's day, not the browser's), `?focus=<id>`
 * scrolls + highlights the cell. Falls back to `?focus=` alone for legacy
 * notifications persisted before `providerTimezone` was added (graceful — the
 * cell highlights only if it's on the default/today view).
 */
function buildStudioCalendarHref(
  bookingId: string,
  startAtUtc?: string,
  providerTimezone?: string,
): string {
  const params = new URLSearchParams();
  if (startAtUtc && providerTimezone) {
    const date = new Date(startAtUtc);
    if (!Number.isNaN(date.getTime())) {
      params.set("view", "day");
      params.set("date", toLocalDateKey(date, providerTimezone));
    }
  }
  params.set("focus", bookingId);
  return `/cabinet/studio/calendar?${params.toString()}`;
}

// R2-06-F: billing notifications get an in-app CTA to the scope-correct billing
// page (the same `billingUpgradeHref` target the push deep-link uses). Scope is
// read from `payload.billingScope` (persisted by `createBillingNotification`);
// absent → bare `/cabinet/billing`, which resolves by role (FIX-26), not a dead-end.
const BILLING_HREF_TYPES = new Set<string>([
  "BILLING_PAYMENT_SUCCEEDED",
  "BILLING_PAYMENT_FAILED",
  "BILLING_PAYMENT_REFUNDED",
  "BILLING_RENEWAL_CONFIRMATION_REQUIRED",
  "BILLING_RENEWAL_PRICE_INCREASE",
  "BILLING_SUBSCRIPTION_CANCELLED",
  "BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN",
  "BILLING_SUBSCRIPTION_EXPIRED",
  "BILLING_TRIAL_ENDING_SOON",
  "BILLING_TRIAL_EXPIRED",
  "BILLING_PLAN_GRANTED_BY_ADMIN",
  "BILLING_PLAN_EDITED",
]);

export function resolveNotificationOpenHref(type: string, payload: unknown): string | undefined {
  if (BILLING_HREF_TYPES.has(type)) {
    const record = parsePayloadRecord(payload);
    const scope = record?.billingScope;
    if (scope === "MASTER" || scope === "STUDIO") return billingUpgradeHref(scope);
    return "/cabinet/billing";
  }

  const booking = parseBookingPayload(payload);
  if (!booking) return undefined;

  if (BOOKING_MASTER_HREF_TYPES.has(type)) {
    if (booking.providerType === "STUDIO") {
      return buildStudioCalendarHref(
        booking.bookingId,
        booking.startAtUtc,
        booking.providerTimezone,
      );
    }
    return `/cabinet/master/dashboard?focus=${booking.bookingId}`;
  }

  if (BOOKING_CLIENT_HREF_TYPES.has(type)) {
    return `/cabinet/bookings?focus=${booking.bookingId}`;
  }

  return undefined;
}
