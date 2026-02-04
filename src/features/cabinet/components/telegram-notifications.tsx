"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type TelegramStatus = {
  linked: boolean;
  enabled: boolean;
  botUsername: string;
};

type TelegramLinkResponse = {
  url: string;
  expiresAt: string;
  alreadyLinked?: boolean;
};

type TelegramSettingsResponse = {
  enabled: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function TelegramNotificationsSection() {
  const t = UI_TEXT.clientCabinet;
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/status", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        linked: boolean;
        enabled: boolean;
        botUsername: string;
      }> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load Telegram status"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load Telegram status"));
      setStatus(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onConnect = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/link", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramLinkResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to get Telegram link"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to get Telegram link"));
      const url = json.data.url;
      window.open(url, "_blank", "noopener,noreferrer");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
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
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to update settings"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to update settings"));
      setStatus((prev) => (prev ? { ...prev, enabled: json.data.enabled } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border p-4 text-sm text-neutral-600">
        {UI_TEXT.common.loading}
      </div>
    );
  }

  const linked = Boolean(status?.linked);
  const enabled = Boolean(status?.enabled);

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold">{t.telegram.title}</div>
        <div className="mt-1 text-sm text-neutral-600">
          {linked ? t.telegram.connected : t.telegram.notConnected}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!linked ? (
          <Button type="button" onClick={onConnect} disabled={saving}>
            {saving ? UI_TEXT.common.loading : t.telegram.connectButton}
          </Button>
        ) : null}

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={!linked || saving}
          />
          {enabled ? t.telegram.enabled : t.telegram.disabled}
        </label>
      </div>

      {linked ? (
        <div className="text-xs text-neutral-500">{t.telegram.hint}</div>
      ) : null}

      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
