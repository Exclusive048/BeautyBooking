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
  CHAT_MESSAGE_RECEIVED: { toastDurationMs: 15000 },
  STUDIO_INVITE_RECEIVED: { toastDurationMs: 15000 },
  STUDIO_INVITE_ACCEPTED: { toastDurationMs: 15000 },
  STUDIO_INVITE_REJECTED: { toastDurationMs: 15000 },
  STUDIO_INVITE_REVOKED: { toastDurationMs: 15000 },
};

const BOOKING_ACTION_TYPES = new Set<string>(["BOOKING_CREATED", "BOOKING_REQUEST"]);
const INVITE_REFRESH_EVENT_TYPES = new Set<string>(["STUDIO_INVITE_RECEIVED", "STUDIO_INVITE_REVOKED"]);

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

