"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
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
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function TelegramNotificationsSection({ embedded = false }: Props) {
  const t = UI_TEXT.clientCabinet;
  const { status, loading, error: statusError, reload } = useTelegramStatus();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConnect = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/link", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramLinkResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.telegram.linkFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.telegram.linkFailed));
      window.open(json.data.url, "_blank", "noopener,noreferrer");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.telegram.unknownError);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramSettingsResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.telegram.settingsFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.telegram.settingsFailed));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.telegram.unknownError);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={embedded ? "text-sm text-text-sec" : "lux-card rounded-[24px] p-4 text-sm text-text-sec"}>
        {UI_TEXT.common.loading}
      </div>
    );
  }

  const linked = Boolean(status?.linked);
  const enabled = Boolean(status?.enabled);

  return (
    <div className={embedded ? "space-y-3" : "lux-card rounded-[24px] p-4 space-y-3"}>
      <ListRow
        icon="TG"
        title={t.telegram.title}
        subtitle={linked ? t.telegram.connected : t.telegram.notConnected}
        right={
          !linked ? (
            <Button type="button" onClick={onConnect} disabled={saving} size="sm">
              {saving ? UI_TEXT.common.loading : t.telegram.connectButton}
            </Button>
          ) : (
            <label className="inline-flex items-center gap-2 text-xs text-text-main">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onToggle(e.target.checked)}
                disabled={!linked || saving}
                className="h-4 w-4 accent-primary"
              />
              {enabled ? t.telegram.enabled : t.telegram.disabled}
            </label>
          )
        }
      />

      {linked ? <div className="text-xs text-text-sec">{t.telegram.hint}</div> : null}
      {error ?? statusError ? <div className="text-xs text-red-600">{error ?? statusError}</div> : null}
    </div>
  );
}
