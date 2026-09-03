"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { clientEnv } from "@/lib/env.client";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * Telegram link-only modal. Renders the official Telegram Login Widget
 * (via script injection) and routes the resulting auth payload to the
 * cabinet-side `/api/auth/telegram/link` endpoint — which links without
 * rotating the session, unlike `/api/auth/telegram/login`.
 *
 * FIX-24 (Item 2b): the widget uses **`data-auth-url`** (redirect mode), NOT
 * `data-onauth`. `data-onauth` makes telegram-widget.js compile the callback
 * string via `new Function`/`eval` at widget-init — the prod CSP `unsafe-eval`
 * violation (same one FIX-23 removed from /login), here firing on the cabinet
 * profile page. In redirect mode the widget navigates to the GET handler at
 * `/api/auth/telegram/link`, which links to the current session and redirects
 * back to `/cabinet/profile?telegram=<result>` (surfaced by the profile page).
 * We mount the script offscreen and forward the click via a styled button so
 * the modal UI stays on-brand instead of rendering Telegram's default chip.
 */
export function TelegramConnectModal({ onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initedRef = useRef(false);

  const botUsername = clientEnv.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  useEffect(() => {
    if (!botUsername || initedRef.current) return;
    if (!containerRef.current) return;
    initedRef.current = true;
    containerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    // FIX-24 (Item 2b): redirect mode → the connect (link) GET callback. Links to
    // the existing session and round-trips back into the cabinet (NOT the login
    // path). Eval-free: telegram-widget never touches its string compiler here.
    script.setAttribute("data-auth-url", "/api/auth/telegram/link");
    containerRef.current.appendChild(script);
  }, [botUsername]);

  function clickHiddenWidget() {
    const iframe = containerRef.current?.querySelector(
      "iframe",
    ) as HTMLIFrameElement | null;
    if (!iframe) return;
    try {
      iframe.contentWindow?.document.querySelector("button")?.click();
    } catch {
      /* cross-origin: ignored */
    }
    iframe.click();
  }

  if (!botUsername) {
    return (
      <ModalSurface
        open
        onClose={onClose}
        title={UI_TEXT.clientCabinet.profilePage.telegramModal.unavailableTitle}
      >
        <div className="space-y-3">
          <p className="text-sm text-text-sec">
            Сейчас не получится подключить Telegram. Попробуйте позже или
            обратитесь в поддержку.
          </p>
          <div className="flex justify-end pt-2">
            <Button variant="primary" size="sm" onClick={onClose}>
              Понятно
            </Button>
          </div>
        </div>
      </ModalSurface>
    );
  }

  return (
    <ModalSurface open onClose={onClose} title={UI_TEXT.clientCabinet.profilePage.telegramModal.connectTitle}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">
          Нажмите кнопку ниже, чтобы войти через Telegram и привязать аккаунт.
          После подтверждения вы вернётесь в профиль — мы сразу покажем, всё ли получилось и
          сможем присылать уведомления в боте.
        </p>

        {/* Hidden widget container — its iframe is what we forward clicks to. */}
        <div
          ref={containerRef}
          className="pointer-events-none absolute opacity-0"
          aria-hidden="true"
        />

        <div className="flex justify-center pt-2">
          <Button variant="primary" size="md" onClick={clickHiddenWidget}>
            Войти через Telegram
          </Button>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
