"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type VkStatus = {
  linked: boolean;
  enabled: boolean;
  available: boolean;
  messagesAllowed: boolean | null;
  chatUrl: string | null;
};

type Props = {
  /** Серверный `isVkAuthEnabled`: без него привязать ВК негде, и непривязанному
   * пользователю секцию не показываем — ссылка вела бы в профиль без кнопки. */
  connectAvailable: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

/**
 * VK-COMMUNITY-NOTIFY-01 — «Уведомления ВКонтакте» в общих настройках.
 *
 * Решения владельца (2026-09-24): настраиваются ТОЛЬКО здесь, одна секция на
 * все роли; в кабинетах мастера и студии их нет. Уведомления включены по
 * умолчанию (при привязке ВК), человек может их выключить. Кнопка «Разрешить
 * сообщения» появляется при подключённом ВК, пока ВКонтакте отвечает, что
 * сообщения от сообщества не разрешены: без этого разрешения VK не пропустит
 * ни одного сообщения.
 *
 * Привязка ВК — в профиле («Связанные аккаунты»), здесь только указатель туда:
 * подключение — акт личности, а не настройка уведомлений
 * (CONSOLIDATE-EXTERNAL-LINKING-01).
 */
export function VkNotificationsSection({ connectAvailable }: Props) {
  const t = UI_TEXT.settings.notifications.vk;
  const [status, setStatus] = useState<VkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetchWithAuth("/api/integrations/vk/status", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ApiResponse<VkStatus> | null;
    if (!res.ok || !json || !json.ok) throw new Error(getErrorMessage(json, t.loadFailed));
    return json.data;
  }, [t.loadFailed]);

  useEffect(() => {
    let cancelled = false;
    fetchStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, t.loadFailed]);

  // Разрешение даётся во ВКонтакте, в другой вкладке или приложении. Когда
  // человек возвращается, тихо перепроверяем — без мигания «Загрузка…».
  const waitingForPermission = Boolean(status?.linked && status.messagesAllowed !== true);
  useEffect(() => {
    if (!waitingForPermission) return;
    const onFocus = () => {
      fetchStatus()
        .then(setStatus)
        .catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [waitingForPermission, fetchStatus]);

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
      if (!res.ok || !json || !json.ok) throw new Error(getErrorMessage(json, t.updateFailed));
      setStatus((prev) => (prev ? { ...prev, enabled: json.data.enabled } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;
  // Сообщество не настроено в админке — канала нет, и обещать его нельзя.
  if (status && !status.available) return null;
  if (status && !status.linked && !connectAvailable) return null;

  const linked = Boolean(status?.linked);

  return (
    <div className="lux-card rounded-[20px] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-input">
          <Users className="h-4 w-4 text-text-sec" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-main">{t.title}</div>
          {status ? (
            <div className="mt-1 text-xs text-text-sec">{linked ? t.connected : t.notConnected}</div>
          ) : null}

          {status && linked ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-text-main">{t.receiveToggle}</span>
                <Switch
                  checked={status.enabled}
                  disabled={saving}
                  onCheckedChange={(next) => void onToggle(next)}
                />
              </div>

              {status.messagesAllowed === false ? (
                <div className="mt-3 rounded-xl border border-warning-border bg-warning-surface px-3 py-2">
                  <p className="text-xs font-medium text-warning-text">{t.allowTitle}</p>
                  <p className="mt-1 text-xs text-warning-text">{t.allowHint}</p>
                  <AllowMessagesButton href={status.chatUrl} label={t.allowAction} />
                </div>
              ) : status.messagesAllowed === null ? (
                <div className="mt-3">
                  <p className="text-xs text-text-sec">{t.allowUnknownHint}</p>
                  <AllowMessagesButton href={status.chatUrl} label={t.allowAction} />
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success-text">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {t.allowed}
                </p>
              )}
            </>
          ) : status ? (
            <>
              <p className="mt-2 text-xs text-text-sec">{t.notConnectedHint}</p>
              <Link
                href="/cabinet/profile"
                className="mt-2 inline-flex text-xs font-medium text-accent-text hover:underline"
              >
                {t.connectInProfile}
              </Link>
            </>
          ) : null}

          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function AllowMessagesButton({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <Button asChild variant="secondary" size="sm" className="mt-2 rounded-xl">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
        <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
      </a>
    </Button>
  );
}
