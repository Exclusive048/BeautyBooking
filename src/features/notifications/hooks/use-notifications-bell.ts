"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationEvent } from "@/lib/notifications/notifier";
import type { ApiResponse } from "@/lib/types/api";
import {
  emitNotificationEvent,
  subscribeNotificationEvent,
  type NotificationBusEvent,
} from "@/lib/notifications/client-bus";

type Options = {
  onEvent?: (event: NotificationEvent) => void;
};

type UnreadResponse = {
  count: number;
  hasUnread: boolean;
};

const MIN_REFRESH_INTERVAL_MS = 400;

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
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
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
      // Let EventSource retry automatically.
    };

    return () => {
      source.close();
    };
  }, [refresh]);

  return {
    hasUnread,
    unreadCount,
    refresh,
  };
}
