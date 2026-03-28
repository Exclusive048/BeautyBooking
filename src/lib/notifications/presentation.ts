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

function parseBookingPayload(payload: unknown): { bookingId: string; providerType?: "MASTER" | "STUDIO" } | null {
  const record = parsePayloadRecord(payload) as BookingPayload | null;
  if (!record) return null;
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
  const providerType =
    record.providerType === "MASTER" || record.providerType === "STUDIO"
      ? record.providerType
      : undefined;
  return { bookingId: record.bookingId, providerType };
}

export function resolveNotificationOpenHref(type: string, payload: unknown): string | undefined {
  const booking = parseBookingPayload(payload);
  if (!booking) return undefined;

  if (BOOKING_MASTER_HREF_TYPES.has(type)) {
    if (booking.providerType === "STUDIO") {
      return "/cabinet/studio/calendar";
    }
    return `/cabinet/master/dashboard?bookingId=${booking.bookingId}`;
  }

  if (BOOKING_CLIENT_HREF_TYPES.has(type)) {
    return `/cabinet/bookings?bookingId=${booking.bookingId}`;
  }

  return undefined;
}
