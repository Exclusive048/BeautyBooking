"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { ModalSurface } from "@/components/ui/modal-surface";
import type { ApiResponse } from "@/lib/types/api";
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

function formatExpiresAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ConnectedAccountsSection() {
  const t = UI_TEXT.clientCabinet.telegram;
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [connectExpiresAt, setConnectExpiresAt] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const loadStatus = useCallback(async (): Promise<TelegramStatus | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/status", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramStatus> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.loadFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.loadFailed));
      setStatus(json.data);
      return json.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : t.unknownError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [t.loadFailed, t.unknownError]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onConnect = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramLinkResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.linkFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.linkFailed));
      setConnectUrl(json.data.url);
      setConnectExpiresAt(json.data.expiresAt);
      setShowConnectModal(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (enabled: boolean) => {
    if (!status?.linked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<TelegramSettingsResponse> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.settingsFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.settingsFailed));
      setStatus((prev) => (prev ? { ...prev, enabled: json.data.enabled } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setSaving(false);
    }
  };

  const refreshAfterConnect = async () => {
    const next = await loadStatus();
    if (next?.linked) {
      setShowConnectModal(false);
    }
  };

  const linked = Boolean(status?.linked);
  const enabled = Boolean(status?.enabled);

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="text-sm font-semibold">Подключенные аккаунты</h3>
      <p className="mt-1 text-xs text-text-sec">Управляйте внешними каналами уведомлений.</p>

      <div className="mt-3 space-y-3">
        <ListRow
          icon="TG"
          title="Уведомления в Telegram"
          subtitle={linked ? "Подключено" : "Не подключено"}
          right={
            loading ? (
              <div className="text-xs text-text-sec">{UI_TEXT.common.loading}</div>
            ) : !linked ? (
              <Button type="button" size="sm" onClick={onConnect} disabled={saving}>
                {saving ? UI_TEXT.common.loading : "Подключить"}
              </Button>
            ) : (
              <label className="inline-flex items-center gap-2 text-xs text-text-main">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => onToggle(event.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 accent-primary"
                />
                {enabled ? "Включено" : "Выключено"}
              </label>
            )
          }
        />
        {error ? <div className="text-xs text-red-600">{error}</div> : null}
      </div>

      {showConnectModal ? (
        <ModalSurface open onClose={() => setShowConnectModal(false)} title="Подключение Telegram">
          <div className="space-y-3 text-sm text-text-sec">
            <p>Нажмите «Открыть Telegram», затем нажмите Start у бота, чтобы связать уведомления.</p>
            {connectExpiresAt ? (
              <p className="text-xs text-text-sec">Ссылка действует до {formatExpiresAt(connectExpiresAt)}.</p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                if (connectUrl) {
                  window.open(connectUrl, "_blank", "noopener,noreferrer");
                }
              }}
              disabled={!connectUrl}
            >
              Открыть Telegram
            </Button>
            <Button type="button" variant="secondary" onClick={() => void refreshAfterConnect()}>
              Проверить статус
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowConnectModal(false)}>
              Закрыть
            </Button>
          </div>
        </ModalSurface>
      ) : null}
    </div>
  );
}
