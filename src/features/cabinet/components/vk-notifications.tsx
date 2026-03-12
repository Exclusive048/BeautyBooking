"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type VkStatus = {
  linked: boolean;
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

export function VkNotificationsSection({
  embedded = false,
  leadingIcon,
  title,
  hint,
  connectLabel,
  connectButtonClassName,
}: Props) {
  const vkText = UI_TEXT.settings.vk;
  const legacyVkText = UI_TEXT.clientCabinet.vk;
  const [status, setStatus] = useState<VkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/integrations/vk/status", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<VkStatus> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, legacyVkText.loadFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, legacyVkText.loadFailed));
      setStatus(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : legacyVkText.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [legacyVkText.loadFailed]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onConnect = () => {
    setError(null);
    setSaving(true);
    window.location.assign("/api/integrations/vk/start");
  };

  const onToggle = async (enabled: boolean) => {
    if (!status?.linked) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/integrations/vk/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ enabled: boolean }> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, legacyVkText.settingsFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, legacyVkText.settingsFailed));
      setStatus((prev) => (prev ? { ...prev, enabled: json.data.enabled } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : legacyVkText.settingsFailed);
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
  const titleText = title ?? vkText.title;
  const hintText = hint ?? legacyVkText.hint;
  const connectText = connectLabel ?? UI_TEXT.settings.vk.connect;
  const defaultConnectClass =
    "shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60";

  return (
    <div className={embedded ? "p-4" : "rounded-2xl bg-white/4 p-4"}>
      <div className="flex items-center justify-between gap-3">
        {leadingIcon ? <div className="shrink-0">{leadingIcon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titleText}</p>
          <p className="mt-0.5 text-xs text-text-sec">{linked ? vkText.connected : legacyVkText.notConnected}</p>
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
            onClick={onConnect}
            disabled={saving}
            className={connectButtonClassName ?? defaultConnectClass}
          >
            {connectText}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-text-sec">{hintText}</p>
      {linked ? <p className="mt-2 text-xs text-text-sec">{enabled ? legacyVkText.enabled : legacyVkText.disabled}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
