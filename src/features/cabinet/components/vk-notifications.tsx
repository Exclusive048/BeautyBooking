"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { VK_NOTIFICATIONS_AVAILABLE } from "@/lib/vk/notifications-availability";
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
  const vkStartText = UI_TEXT.settings.vk.connectFailure;
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

  // FIX-B14: `/api/integrations/vk/start` — навигация (см. `onConnect` ниже), и
  // её отказы раньше рисовали в окне JSON-конверт. Теперь она возвращает
  // браузер сюда с `?vk=<исход>`. Читаем флаг здесь, а не на странице-хозяине:
  // компонент рендерится в нескольких кабинетах, и per-page плюмбинг разошёлся
  // бы ровно там, где кнопку добавят следующей. `window.location.search`, а не
  // `useSearchParams()` — последний требует Suspense-границы у каждого хозяина.
  useEffect(() => {
    const failure = new URLSearchParams(window.location.search).get("vk");
    if (!failure) return;
    if (failure === "provider_unavailable") setError(vkStartText.providerUnavailable);
    else if (failure === "start_failed") setError(vkStartText.startFailed);
    else return;
    const url = new URL(window.location.href);
    url.searchParams.delete("vk");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [vkStartText.providerUnavailable, vkStartText.startFailed]);

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
      <div className={embedded ? "p-4 text-sm text-text-sec" : "rounded-2xl bg-white/[0.04] p-4 text-sm text-text-sec"}>
        {UI_TEXT.common.loading}
      </div>
    );
  }

  const linked = Boolean(status?.linked);
  const enabled = Boolean(status?.enabled);
  const titleText = title ?? vkText.title;
  const hintText = hint ?? legacyVkText.hint;
  const connectText = connectLabel ?? UI_TEXT.settings.vk.connect;

  return (
    <div className={embedded ? "p-4" : "rounded-2xl bg-white/[0.04] p-4"}>
      <div className="flex items-center justify-between gap-3">
        {leadingIcon ? <div className="shrink-0">{leadingIcon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titleText}</p>
          <p className="mt-0.5 text-xs text-text-sec">{linked ? vkText.connected : legacyVkText.notConnected}</p>
        </div>
        {linked ? (
          // VK-NOTIFICATIONS-FLAG-A: disable the toggle (visibility-over-
          // hiding) when the subsystem is off. Linked status is still
          // shown — login/connection stays intact. Tooltip explains
          // the temporary lock so the user doesn't think it's broken.
          <Switch
            checked={VK_NOTIFICATIONS_AVAILABLE ? enabled : false}
            onCheckedChange={(next) => void onToggle(next)}
            disabled={saving || !VK_NOTIFICATIONS_AVAILABLE}
            title={!VK_NOTIFICATIONS_AVAILABLE ? vkText.temporarilyUnavailable : undefined}
            className="shrink-0"
          />
        ) : (
          // FIX-EXTERNAL-GATING-01 (G-3): this is a VK-OAuth *link* action. It
          // intentionally doesn't gate on the notifications-delivery flag
          // (`VK_NOTIFICATIONS_AVAILABLE`); the VK-auth gate (`isVkAuthEnabled`,
          // server-only) is applied by every call-site that mounts this section,
          // so an unlinked user only reaches this button when VK auth is on.
          <Button
            variant="secondary"
            onClick={onConnect}
            disabled={saving}
            className={connectButtonClassName}
          >
            {connectText}
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-text-sec">{hintText}</p>
      {linked ? <p className="mt-2 text-xs text-text-sec">{enabled ? legacyVkText.enabled : legacyVkText.disabled}</p> : null}
      {!VK_NOTIFICATIONS_AVAILABLE ? (
        <p className="mt-2 rounded-lg bg-bg-input/60 px-2.5 py-2 text-xs text-text-sec">
          {vkText.temporarilyUnavailableHint}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
