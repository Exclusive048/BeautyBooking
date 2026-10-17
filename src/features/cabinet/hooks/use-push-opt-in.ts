"use client";

import { useCallback, useEffect, useState } from "react";
import { clientEnv } from "@/lib/env.client";
import { useMe, useRevalidateMe } from "@/lib/hooks/use-me";
import {
  getPushPermission,
  isPushSupported,
  requestAndSubscribe,
  unsubscribeBrowserPush,
} from "@/lib/notifications/push/push-client";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

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
 *
 * Флаг читается из общего ответа `/api/me` (`useMe`, SWR): раньше хук делал
 * свой запрос, и на главной кабинета `/api/me` уходил лишний раз на каждое
 * открытие. Разрешение браузера читается после монтирования — до этого хук
 * отдаёт `loading`, и первый рендер совпадает с серверным (оба потребителя
 * в загрузке ничего не рисуют).
 */
export function usePushOptIn(): PushOptIn {
  const t = UI_TEXT.settings.notifications.push;
  const me = useMe();
  const revalidateMe = useRevalidateMe();

  // Выбор пользователя в этой вкладке — поверх ответа сервера, пока SWR его
  // не перечитал.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | null>(null);

  useEffect(() => {
    // API браузера, на сервере его нет.
    setPermission(getPushPermission());
  }, []);

  const enabled = chosen ?? Boolean(me.user?.pushNotificationsEnabled);
  const loading = me.isLoading || permission === null;

  const persist = useCallback(
    async (next: boolean) => {
      await fetchJsonWithAuth<unknown>("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushNotificationsEnabled: next }),
      });
      setChosen(next);
      void revalidateMe();
    },
    [revalidateMe]
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
        } else {
          await persist(false);
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

  return { enabled, loading, toggling, error, permission: permission ?? "default", toggle };
}
