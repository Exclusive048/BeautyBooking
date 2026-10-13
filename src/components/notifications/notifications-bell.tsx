"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import type { NotificationEvent } from "@/lib/notifications/types";
import {
  getNotificationPresentation,
  isBookingActionNotification,
  resolveNotificationOpenHref,
} from "@/lib/notifications/presentation";
import { useNotificationsBell } from "@/features/notifications/hooks/use-notifications-bell";
import { UI_FMT } from "@/lib/ui/fmt";
import { DISTANCE, MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { fetchJsonWithAuth } from "@/lib/http/client";
import { useIsHydrated } from "@/hooks/use-is-hydrated";

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
  // Портал всплывающих уведомлений — только на клиенте.
  const hydrated = useIsHydrated();
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

  // Закрыть до таймера: крестиком или нажатием на само уведомление (в том
  // числе на его кнопку — действие выполняется, уведомление уходит).
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timers = timersRef.current;
    const timer = timers.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.delete(id);
    }
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
      await fetchJsonWithAuth<unknown>(`/api/notifications/${notificationId}/read`, { method: "POST" });
    } catch {
      // Фон: пометка «прочитано» при открытии — отказ не мешает перейти.
    } finally {
      refresh();
    }
  };

  const handleConfirm = async (notificationId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) return;
    try {
      await fetchJsonWithAuth<unknown>(`/api/bookings/${booking.bookingId}/confirm`, { method: "POST" });
      await markRead(notificationId);
    } catch {
      // ignore
    }
  };

  const handleDecline = async (notificationId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) return;
    try {
      await fetchJsonWithAuth<unknown>(`/api/bookings/${booking.bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: UI_TEXT.notifications.declineReason }),
      });
      await markRead(notificationId);
    } catch {
      // ignore
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
            <span className="absolute -right-1 -top-1 inline-flex h-3 w-3 rounded-full bg-destructive" />
          ) : null}
        </Link>
      </Button>

      {/* 29.09 доработки · 21: всплывающие уведомления — порталом в `body`
          на слое `z-toast`. Внутри шапки (`sticky` + `backdrop-blur`) `fixed`
          отсчитывался от шапки, а не от экрана, и уходил под затемнение окна.
          Фон непрозрачный: сквозь `bg-bg-card/90` читался текст страницы.
          На телефоне — во всю ширину с полями, ниже «чёлки». */}
      {hydrated ? createPortal(
        <div className="pointer-events-none fixed inset-x-4 top-[calc(var(--safe-area-inset-top)+0.75rem)] z-toast mx-auto flex max-w-md flex-col gap-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:mx-0 sm:w-[360px]">
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const booking = parseBookingPayload(toast.payloadJson);
              const chatPayload =
                toast.type === "CHAT_MESSAGE_RECEIVED" ? parseChatPayload(toast.payloadJson) : null;
              const openHref = resolveNotificationOpenHref(toast.type, toast.payloadJson);
              const canAct =
                isBookingActionNotification(toast.type) &&
                booking?.bookingId &&
                (!booking.bookingStatus || booking.bookingStatus === "PENDING");

              return (
                <m.div
                  key={toast.id}
                  initial={{ opacity: 0, y: -DISTANCE.nudge }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -DISTANCE.nudge, transition: MOTION.exit }}
                  transition={MOTION.base}
                  data-testid="notification-toast"
                  // Нажатие в любом месте закрывает уведомление; кнопки внутри
                  // сначала делают своё (переход, подтверждение), потом оно уходит.
                  onClick={() => dismissToast(toast.id)}
                  className="pointer-events-auto cursor-pointer rounded-2xl border border-border-subtle bg-bg-card py-3 pl-4 pr-2 shadow-hover"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="text-sm font-semibold text-text-main">{UI_TEXT.notifications.toastTitle}</div>
                      <div className="mt-1 break-words text-sm text-text-sec">{toast.body}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={UI_TEXT.common.close}
                      onClick={() => dismissToast(toast.id)}
                      className="-mt-1 shrink-0 text-text-sec"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </Button>
                  </div>
                  <div className="pr-2">
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
                    {toast.type !== "CHAT_MESSAGE_RECEIVED" && openHref ? (
                      <div className="mt-3">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={openHref}>{UI_TEXT.notifications.openAction}</Link>
                        </Button>
                      </div>
                    ) : null}
                    <div className="mt-2 text-2xs text-text-sec">
                      {UI_FMT.dateTimeLong(toast.createdAt, { timeZone: viewerTimeZone })}
                    </div>
                  </div>
                </m.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
