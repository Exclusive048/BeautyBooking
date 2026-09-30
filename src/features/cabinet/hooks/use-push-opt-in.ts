"use client";

import { useCallback, useEffect, useState } from "react";
import { clientEnv } from "@/lib/env.client";
import {
  getPushPermission,
  isPushSupported,
  requestAndSubscribe,
  unsubscribeBrowserPush,
} from "@/lib/notifications/push/push-client";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

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
      const data = await fetchJsonWithAuth<{ user: MeUser | null }>("/api/me", { cache: "no-store" });
      if (data.user) setEnabled(Boolean(data.user.pushNotificationsEnabled));
    } catch {
      // Фон: не прочитали — остаётся состояние по умолчанию, тумблер работает.
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
      await fetchJsonWithAuth<unknown>("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushNotificationsEnabled: next }),
      });
    },
    []
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
        setError(serverMessageOr(err, t.toggleFailed));
      } finally {
        setToggling(false);
      }
    },
    [persist, t.denied, t.enableFailed, t.toggleFailed, t.unsupported]
  );

  return { enabled, loading, toggling, error, permission, toggle };
}
