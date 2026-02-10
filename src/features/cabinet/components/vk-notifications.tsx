"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type VkStatus = {
  linked: boolean;
  enabled: boolean;
  username?: string | null;
  avatarUrl?: string | null;
};

type VkSettingsResponse = {
  enabled: boolean;
};

type Props = {
  embedded?: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function VkNotificationsSection({ embedded = false }: Props) {
  const t = UI_TEXT.clientCabinet;
  const [status, setStatus] = useState<VkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/integrations/vk", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<VkStatus> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.vk.loadFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.vk.loadFailed));
      setStatus(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.vk.unknownError);
    } finally {
      setLoading(false);
    }
  }, [t.vk.loadFailed, t.vk.unknownError]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onConnect = () => {
    setError(null);
    setSaving(true);
    window.location.assign("/api/auth/vk/start?mode=link");
  };

  const onToggle = async (enabled: boolean) => {
    if (!status?.linked) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/integrations/vk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<VkSettingsResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.vk.settingsFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.vk.settingsFailed));
      setStatus((prev) => (prev ? { ...prev, enabled: json.data.enabled } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.vk.unknownError);
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
        icon="VK"
        title={t.vk.title}
        subtitle={linked ? t.vk.connected : t.vk.notConnected}
        right={
          !linked ? (
            <Button type="button" onClick={onConnect} disabled={saving} size="sm">
              {saving ? UI_TEXT.common.loading : t.vk.connectButton}
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
              {enabled ? t.vk.enabled : t.vk.disabled}
            </label>
          )
        }
      />

      {linked ? <div className="text-xs text-text-sec">{t.vk.hint}</div> : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
