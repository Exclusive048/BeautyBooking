"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import {
  emitNotificationEvent,
  subscribeNotificationEvent,
  type NotificationBusEvent,
} from "@/lib/notifications/client-bus";
import type { NotificationEvent } from "@/lib/notifications/types";

type Options = {
  onEvent?: (event: NotificationEvent) => void;
};

type UnreadResponse = {
  count: number;
  hasUnread: boolean;
};

const MIN_REFRESH_INTERVAL_MS = 400;
/**
 * RES-19 — период опроса, когда SSE закрылся окончательно.
 *
 * 60 с: счётчик непрочитанного — не реалтайм-критичная величина, а опрос идёт
 * у каждой открытой вкладки, поэтому чаще означает постоянную фоновую
 * нагрузку ради секунд задержки. Внутривкладочные действия счётчик обновляют
 * и без этого — через шину `subscribeNotificationEvent`.
 */
const SSE_FALLBACK_POLL_MS = 60_000;

export function useNotificationsBell(options: Options = {}) {
  const [hasUnread, setHasUnread] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const onEventRef = useRef<Options["onEvent"]>(options.onEvent);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    onEventRef.current = options.onEvent;
  }, [options.onEvent]);

  const performRefresh = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    const now = Date.now();
    if (now - lastRefreshRef.current < MIN_REFRESH_INTERVAL_MS) {
      pendingRef.current = false;
      return;
    }

    lastRefreshRef.current = now;
    inFlightRef.current = true;

    try {
      // Bell sits in the global navbar — only personal-stream events
      // (account, billing, studio invites, client-side bookings) belong
      // here. Master operational events live in the master sidebar badge,
      // counted separately by the cabinet layout.
      const res = await fetch("/api/notifications/unread-count?context=personal", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<UnreadResponse> | null;
      if (!res.ok || !json || !json.ok) return;
      setUnreadCount(json.data.count);
      setHasUnread(json.data.hasUnread);
    } catch {
      // ignore
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void performRefresh();
      }
    }
  }, []);

  const refresh = useCallback(() => {
    void performRefresh();
  }, [performRefresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeNotificationEvent((event: NotificationBusEvent) => {
      if (event.kind === "incoming") return;
      refresh();
    });
  }, [refresh]);

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer) return;
      // RES-19: фоллбэк включается ТОЛЬКО на окончательно закрытом потоке.
      // Транзиентный обрыв `EventSource` переподключает сам, и опрос рядом с
      // живым ретраем удвоил бы нагрузку без пользы.
      pollTimer = setInterval(refresh, SSE_FALLBACK_POLL_MS);
      refresh();
    };

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as NotificationEvent;
        onEventRef.current?.(payload);
        emitNotificationEvent({ kind: "incoming", notification: payload, notificationId: payload.id });
        refresh();
      } catch {
        // ignore malformed payload
      }
    };
    source.onerror = () => {
      // RES-19: пустой обработчик покрывал только транзиентный обрыв — его
      // `EventSource` действительно переподключает сам. Но при не-2xx или
      // неверном `Content-Type` спека предписывает `readyState = CLOSED` БЕЗ
      // ретрая, а именно это отдаёт роут, когда нотифаер недоступен (503
      // `NOTIFIER_UNAVAILABLE`). Тогда счётчик замирал до полной навигации:
      // вкладка выглядит рабочей и молча показывает устаревшее число.
      if (source.readyState === EventSource.CLOSED) {
        startPolling();
      }
    };

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      source.close();
    };
  }, [refresh]);

  return {
    hasUnread,
    unreadCount,
    refresh,
  };
}
