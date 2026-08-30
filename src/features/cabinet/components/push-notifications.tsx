"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

/**
 * FIX-EXP-NOTIFICATIONS (EXP-027/028): the manual push on/off control.
 * Enabling requests browser permission from THIS click (a user gesture) — push
 * permission is never requested on page load anymore. After a denial the toggle
 * stays the re-enable path: it re-checks permission (in case the user changed
 * OS/browser settings) and shows guidance otherwise.
 */
export function PushNotificationsSection() {
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

  const handleToggle = useCallback(
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

  if (loading) return null;

  const unsupported = permission === "unsupported";

  return (
    <div className="lux-card rounded-[20px] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-input">
          <Bell className="h-4 w-4 text-text-sec" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-main">{t.title}</div>
          <div className="mt-1 text-xs text-text-sec">{t.desc}</div>

          {unsupported ? (
            <div className="mt-3 text-xs text-text-sec">{t.unsupported}</div>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-text-main">{t.receiveToggle}</span>
                <Switch
                  checked={enabled}
                  disabled={toggling}
                  onCheckedChange={(v) => void handleToggle(v)}
                />
              </div>

              {!enabled && permission === "default" ? (
                <div className="mt-2 text-xs text-text-sec">{t.permissionPrompt}</div>
              ) : null}
              {permission === "denied" ? (
                <div className="mt-2 text-xs text-text-sec">{t.denied}</div>
              ) : null}
            </>
          )}

          {error ? (
            <div role="alert" className="mt-2 text-xs text-red-500">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
