"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { useTelegramStatus } from "@/lib/hooks/use-telegram-status";
import { isTelegramEnabled } from "@/lib/env.client";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

type TelegramSettingsResponse = {
  enabled: boolean;
};

type Props = {
  embedded?: boolean;
  leadingIcon?: ReactNode;
  title?: string;
  hint?: string;
};

export function TelegramNotificationsSection({
  embedded = false,
  leadingIcon,
  title,
  hint,
}: Props) {
  const t = UI_TEXT.settings.notifications.telegram;
  const { status, loading, error: statusError, reload } = useTelegramStatus();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FIX-TELEGRAM-KILLSWITCH: component-level guard placed AFTER the hooks
  // (rules-of-hooks — hooks must run unconditionally). Defense-in-depth: the
  // render sites are also gated, so when off this component normally isn't
  // mounted; this guard covers any direct/legacy caller.
  if (!isTelegramEnabled) return null;

  // CONSOLIDATE-EXTERNAL-LINKING-01: connect/disconnect moved to the canonical
  // profile «Связанные аккаунты» card. This surface is delivery-only — the old
  // in-place «Подключить» (bot-DM link) affordance is gone; when unlinked we
  // point to the profile instead. The `/api/telegram/link` endpoint is
  // preserved (still used by the profile flow).

  const onToggle = async (enabled: boolean) => {
    if (!status?.linked) return;
    setError(null);
    setSaving(true);
    try {
      await fetchJsonWithAuth<TelegramSettingsResponse>("/api/telegram/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await reload();
    } catch (e) {
      setError(serverMessageOr(e, t.updateFailed));
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
  const titleText = title ?? t.title;
  const hintText = hint ?? t.hint;

  return (
    <div className={embedded ? "p-4" : "rounded-2xl bg-white/[0.04] p-4"}>
      <div className="flex items-center justify-between gap-3">
        {leadingIcon ? <div className="shrink-0">{leadingIcon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titleText}</p>
          <p className="mt-0.5 text-xs text-text-sec">{linked ? t.connected : t.notConnected}</p>
        </div>
        {/* CONSOLIDATE-EXTERNAL-LINKING-01: delivery toggle only. Inactive until
            the account is linked (linking happens in the profile card); the
            pointer below routes there. Never a «Подключить» here — connecting is
            an identity act, not a notifications one. */}
        <Switch
          checked={linked ? enabled : false}
          onCheckedChange={(next) => void onToggle(next)}
          disabled={saving || !linked}
          className="shrink-0"
        />
      </div>

      {linked ? (
        <p className="mt-2 text-xs text-text-sec">{hintText}</p>
      ) : (
        <Link
          href="/cabinet/profile"
          className="mt-2 inline-flex text-xs font-medium text-accent-text hover:underline"
        >
          {t.connectInProfile}
        </Link>
      )}
      {error ?? statusError ? <p className="mt-2 text-xs text-danger-text">{error ?? statusError}</p> : null}
    </div>
  );
}
