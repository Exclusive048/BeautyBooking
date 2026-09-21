"use client";

import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePushOptIn } from "@/features/cabinet/hooks/use-push-opt-in";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * FIX-EXP-NOTIFICATIONS (EXP-027/028): the manual push on/off control.
 * Enabling requests browser permission from THIS click (a user gesture) — push
 * permission is never requested on page load anymore. After a denial the toggle
 * stays the re-enable path: it re-checks permission (in case the user changed
 * OS/browser settings) and shows guidance otherwise.
 *
 * PWA-ONBOARDING-01: логика вынесена в `usePushOptIn` — её же использует
 * онбординг «Приложение и уведомления» (`app-setup-card.tsx`).
 */
export function PushNotificationsSection() {
  const t = UI_TEXT.settings.notifications.push;
  const { enabled, loading, toggling, error, permission, toggle } = usePushOptIn();

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
                  onCheckedChange={(v) => void toggle(v)}
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
