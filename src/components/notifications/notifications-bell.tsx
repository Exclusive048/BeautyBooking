"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import type { ApiResponse } from "@/lib/types/api";
import type { NotificationEvent } from "@/lib/notifications/types";
import { getNotificationPresentation, isBookingActionNotification } from "@/lib/notifications/presentation";
import { useNotificationsBell } from "@/features/notifications/hooks/use-notifications-bell";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  ariaLabel: string;
};

type ToastItem = NotificationEvent;

type BookingPayload = {
  bookingId?: unknown;
  bookingStatus?: unknown;
};

type ChatPayload = {
  bookingId?: unknown;
  senderType?: unknown;
};

function parseBookingPayload(payload: unknown): { bookingId: string; bookingStatus?: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as BookingPayload;
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
  const bookingStatus = typeof record.bookingStatus === "string" ? record.bookingStatus : undefined;
  return { bookingId: record.bookingId, bookingStatus };
}

function parseChatPayload(payload: unknown): { bookingId: string; senderType?: "CLIENT" | "MASTER" } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as ChatPayload;
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
  const senderType =
    record.senderType === "CLIENT" || record.senderType === "MASTER" ? record.senderType : undefined;
  return { bookingId: record.bookingId, senderType };
}

function resolveChatHref(payload: { bookingId: string; senderType?: "CLIENT" | "MASTER" }): string {
  const params = new URLSearchParams({ bookingId: payload.bookingId, chat: "open" });
  if (payload.senderType === "CLIENT") {
    return `/cabinet/master/dashboard?${params.toString()}`;
  }
  return `/cabinet/bookings?${params.toString()}`;
}

export function NotificationsBell({ ariaLabel }: Props) {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const viewerTimeZone = useViewerTimeZoneContext();
  const timersRef = useRef<Map<string, number>>(new Map());
  const seenToastIdsRef = useRef<Map<string, number>>(new Map());

  const handleToast = useCallback((payload: NotificationEvent) => {
    const presentation = getNotificationPresentation(payload.type);
    if (!presentation.showToast) return;

    const timers = timersRef.current;
    const seen = seenToastIdsRef.current;
    if (seen.has(payload.id)) return;
    const seenTimeout = window.setTimeout(() => {
      seen.delete(payload.id);
    }, presentation.dedupeWindowMs);
    seen.set(payload.id, seenTimeout);

    setToasts((current) => {
      const filtered = current.filter((item) => item.id !== payload.id);
      const next = [payload, ...filtered];
      return next.slice(0, presentation.maxVisibleToasts);
    });
    const existing = timers.get(payload.id);
    if (existing) {
      window.clearTimeout(existing);
      timers.delete(payload.id);
    }
    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== payload.id));
      timers.delete(payload.id);
    }, presentation.toastDurationMs);
    timers.set(payload.id, timeoutId);
  }, []);

  const { hasUnread, unreadCount, refresh } = useNotificationsBell({ onEvent: handleToast });

  useEffect(() => {
    const timers = timersRef.current;
    const seen = seenToastIdsRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      seen.forEach((timer) => window.clearTimeout(timer));
      seen.clear();
    };
  }, []);

  const markRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: "POST" });
    } catch {
      // ignore
    } finally {
      refresh();
    }
  };

  const handleConfirm = async (notificationId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) return;
    try {
      const res = await fetch(`/api/bookings/${booking.bookingId}/confirm`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await markRead(notificationId);
    } catch (error) {
      console.error("Failed to confirm booking from toast", error);
    }
  };

  const handleDecline = async (notificationId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) return;
    try {
      const res = await fetch(`/api/bookings/${booking.bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: UI_TEXT.notifications.declineReason }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await markRead(notificationId);
    } catch (error) {
      console.error("Failed to decline booking from toast", error);
    }
  };

  const handleOpenChat = async (notificationId: string, payload: unknown) => {
    const chatPayload = parseChatPayload(payload);
    if (!chatPayload) return;
    router.push(resolveChatHref(chatPayload));
    await markRead(notificationId);
  };

  return (
    <>
      <Button asChild variant="secondary" className="relative">
        <Link
          href="/notifications"
          aria-label={unreadCount > 0 ? `${ariaLabel} (${unreadCount})` : ariaLabel}
          title={unreadCount > 0 ? `${ariaLabel} (${unreadCount})` : ariaLabel}
        >
          <span aria-hidden>🔔</span>
          {hasUnread ? (
            <span className="absolute -right-1 -top-1 inline-flex h-3 w-3 rounded-full bg-red-500" />
          ) : null}
        </Link>
      </Button>

      {toasts.length > 0 ? (
        <div className="fixed right-4 top-4 z-50 flex w-[min(360px,90vw)] flex-col gap-3">
          {toasts.map((toast) => {
            const booking = parseBookingPayload(toast.payloadJson);
            const chatPayload =
              toast.type === "CHAT_MESSAGE_RECEIVED" ? parseChatPayload(toast.payloadJson) : null;
            const canAct =
              isBookingActionNotification(toast.type) &&
              booking?.bookingId &&
              (!booking.bookingStatus || booking.bookingStatus === "PENDING");

            return (
              <div
                key={toast.id}
                className="rounded-2xl border border-border-subtle bg-bg-card/90 p-4 shadow-card"
              >
                <div className="text-sm font-semibold text-text-main">{UI_TEXT.notifications.toastTitle}</div>
                <div className="mt-1 text-sm text-text-sec">{toast.body}</div>
                {canAct ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void handleConfirm(toast.id, toast.payloadJson)}>
                      {UI_TEXT.actions.confirm}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleDecline(toast.id, toast.payloadJson)}
                    >
                      {UI_TEXT.actions.decline}
                    </Button>
                  </div>
                ) : null}
                {toast.type === "CHAT_MESSAGE_RECEIVED" && chatPayload ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleOpenChat(toast.id, toast.payloadJson)}
                    >
                      {UI_TEXT.actions.openChat}
                    </Button>
                  </div>
                ) : null}
                <div className="mt-2 text-[11px] text-text-sec">
                  {UI_FMT.dateTimeLong(toast.createdAt, { timeZone: viewerTimeZone })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
