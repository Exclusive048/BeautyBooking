"use client";

import type { NotificationEvent } from "@/lib/notifications/notifier";
import { NOTIFICATIONS_UPDATED_EVENT } from "@/lib/notifications/constants";

export type NotificationBusEvent = {
  kind: "incoming" | "updated" | "read";
  notification?: NotificationEvent;
  notificationId?: string;
};

export function emitNotificationEvent(event: NotificationBusEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotificationBusEvent>(NOTIFICATIONS_UPDATED_EVENT, { detail: event }));
}

export function subscribeNotificationEvent(
  handler: (event: NotificationBusEvent) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    handler(event.detail as NotificationBusEvent);
  };

  window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, listener as EventListener);
  return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, listener as EventListener);
}
