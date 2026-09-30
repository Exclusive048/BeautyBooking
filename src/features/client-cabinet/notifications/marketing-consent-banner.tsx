"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.clientCabinet.notifications.marketingBanner;

/** Скрытие плашки — удобство одного зрителя, не состояние продукта. */
const DISMISS_KEY = "mr-marketing-banner-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // приватный режим — плашка просто покажется снова
  }
}

/**
 * 29.09 доработки · 16 (решение 16.2) — «Разрешите акции мастеров».
 *
 * С варианта В (Ю1) скидочные «горящие окошки» — реклама и приходят только с
 * согласием на акции. Тем, кто подписан на мастеров, но согласия не давал, один
 * раз показывается плашка — без рассылки. «Разрешить» пишет согласие тем же
 * путём, что переключатель в настройках (`PATCH /api/me/consents/marketing`,
 * инв. #37); «Не сейчас» прячет плашку в этом браузере.
 */
export function MarketingConsentBanner() {
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (readDismissed()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [consent, subscriptions] = await Promise.all([
          fetchJson<{ enabled: boolean }>("/api/me/consents/marketing", { cache: "no-store" }),
          fetchJson<{ items: unknown[] }>("/api/hot-slots/subscribe", { cache: "no-store" }),
        ]);
        if (!cancelled) setVisible(!consent.enabled && subscriptions.items.length > 0);
      } catch {
        // Фоновое чтение: пользователь ничего не просил — отказ не показываем,
        // плашка просто не появляется.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const allow = async () => {
    setSaving(true);
    try {
      await fetchJson("/api/me/consents/marketing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      setVisible(false);
      toast.success(T.allowed);
    } catch (caught) {
      toast.error(serverMessageOr(caught, T.allowFailed));
    } finally {
      setSaving(false);
    }
  };

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  return (
    <Card data-testid="marketing-consent-banner" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-accent-text">
          <Megaphone className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-sm font-medium text-text-main">{T.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-sec">{T.body}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onClick={() => void allow()} disabled={saving}>
          {T.allow}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss} disabled={saving}>
          {T.dismiss}
        </Button>
      </div>
    </Card>
  );
}
