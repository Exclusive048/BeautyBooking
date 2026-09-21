"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import { clientEnv } from "@/lib/env.client";
import {
  getPushPermission,
  isPushSupported,
  requestAndSubscribe,
  unsubscribeBrowserPush,
} from "@/lib/notifications/push/push-client";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type MeUser = {
  pushNotificationsEnabled: boolean;
};

export type PushOptIn = {
  enabled: boolean;
  loading: boolean;
  toggling: boolean;
  error: string | null;
  permission: NotificationPermission | "unsupported";
  toggle: (next: boolean) => Promise<void>;
};

/**
 * FIX-EXP-NOTIFICATIONS (EXP-027/028) + PWA-ONBOARDING-01: включение push —
 * одна логика на все поверхности (настройки, онбординг «Приложение и
 * уведомления»). Разрешение браузера запрашивается ТОЛЬКО из `toggle(true)`,
 * то есть из жеста пользователя, — никогда на загрузке страницы.
 */
export function usePushOptIn(): PushOptIn {
  const t = UI_TEXT.settings.notifications.push;

  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/me", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ user: MeUser | null }> | null;
      if (json?.ok && json.data.user) {
        setEnabled(Boolean(json.data.user.pushNotificationsEnabled));
      }
    } finally {
      setPermission(getPushPermission());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (next: boolean) => {
      const res = await fetchWithAuth("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushNotificationsEnabled: next }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.toggleFailed);
      }
    },
    [t.toggleFailed]
  );

  const toggle = useCallback(
    async (next: boolean) => {
      setToggling(true);
      setError(null);
      try {
        if (next) {
          const vapidKey = clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!vapidKey || !isPushSupported()) {
            setError(t.unsupported);
            setPermission(getPushPermission());
            return;
          }
          const result = await requestAndSubscribe(vapidKey);
          setPermission(getPushPermission());
          if (result === "unsupported") {
            setError(t.unsupported);
            return;
          }
          if (result === "denied") {
            setError(t.denied);
            return;
          }
          if (result === "error") {
            setError(t.enableFailed);
            return;
          }
          // "subscribed" or "no-sw" (permission granted; SW will subscribe on a
          // production load) — persist the opt-in intent either way.
          await persist(true);
          setEnabled(true);
        } else {
          await persist(false);
          setEnabled(false);
          void unsubscribeBrowserPush();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t.toggleFailed);
      } finally {
        setToggling(false);
      }
    },
    [persist, t.denied, t.enableFailed, t.toggleFailed, t.unsupported]
  );

  return { enabled, loading, toggling, error, permission, toggle };
}
