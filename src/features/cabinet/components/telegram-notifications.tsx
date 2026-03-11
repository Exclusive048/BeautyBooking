"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import type { ApiResponse } from "@/lib/types/api";
import { useTelegramStatus } from "@/lib/hooks/use-telegram-status";
import { UI_TEXT } from "@/lib/ui/text";

type TelegramLinkResponse = {
  url: string;
  expiresAt: string;
  alreadyLinked?: boolean;
};

type TelegramSettingsResponse = {
  enabled: boolean;
};

type Props = {
  embedded?: boolean;
  leadingIcon?: ReactNode;
  title?: string;
  hint?: string;
  connectLabel?: string;
  connectButtonClassName?: string;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function TelegramNotificationsSection({
  embedded = false,
  leadingIcon,
  title,
  hint,
  connectLabel,
  connectButtonClassName,
}: Props) {
  const t = UI_TEXT.settings.notifications.telegram;
  const { status, loading, error: statusError, reload } = useTelegramStatus();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConnect = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/link", { cache: "no-store", credentials: "include" });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramLinkResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.connectFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.connectFailed));
      window.open(json.data.url, "_blank", "noopener,noreferrer");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.connectFailed);
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (enabled: boolean) => {
    if (!status?.linked) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramSettingsResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.updateFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.updateFailed));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={embedded ? "p-4 text-sm text-text-sec" : "rounded-2xl bg-white/4 p-4 text-sm text-text-sec"}>
        {UI_TEXT.common.loading}
      </div>
    );
  }

  const linked = Boolean(status?.linked);
  const enabled = Boolean(status?.enabled);
  const titleText = title ?? t.title;
  const hintText = hint ?? t.hint;
  const connectText = connectLabel ?? t.connect;
  const defaultConnectClass =
    "shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60";

  return (
    <div className={embedded ? "p-4" : "rounded-2xl bg-white/4 p-4"}>
      <div className="flex items-center justify-between gap-3">
        {leadingIcon ? <div className="shrink-0">{leadingIcon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titleText}</p>
          <p className="mt-0.5 text-xs text-text-sec">{linked ? t.connected : t.notConnected}</p>
        </div>
        {linked ? (
          <Switch
            checked={enabled}
            onCheckedChange={(next) => void onToggle(next)}
            disabled={saving}
            className="shrink-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => void onConnect()}
            disabled={saving}
            className={connectButtonClassName ?? defaultConnectClass}
          >
            {connectText}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-text-sec">{hintText}</p>
      {error ?? statusError ? <p className="mt-2 text-xs text-rose-400">{error ?? statusError}</p> : null}
    </div>
  );
}
