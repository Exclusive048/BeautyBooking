"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";

type TelegramAuthUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    __mr_onTelegramLink?: (user: TelegramAuthUser) => void;
  }
}

type Status = "idle" | "linking" | "success" | "error";

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
 * The widget callback name is namespaced (`__mr_onTelegramLink`) so it
 * doesn't collide with the global `onTelegramAuth` used by the login
 * button on `/login`. We mount the script lazily inside an offscreen
 * container and forward iframe clicks via a styled button so the modal
 * UI stays on-brand instead of rendering Telegram's default chip.
 */
export function TelegramConnectModal({ onClose, onSuccess }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initedRef = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  useEffect(() => {
    window.__mr_onTelegramLink = async (user) => {
      setStatus("linking");
      setError(null);
      try {
        const res = await fetch("/api/auth/telegram/link", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          const code = json?.error?.code;
          if (code === "CONFLICT") {
            setError("Этот Telegram-аккаунт уже привязан к другому пользователю.");
          } else if (code === "INVALID_HASH" || code === "AUTH_DATE_EXPIRED") {
            setError("Не удалось проверить данные Telegram. Попробуйте ещё раз.");
          } else {
            setError("Ошибка привязки. Попробуйте позже.");
          }
          setStatus("error");
          return;
        }
        setStatus("success");
        // Brief delay so the user sees the success state before close.
        setTimeout(() => {
          onSuccess();
        }, 800);
      } catch {
        setError("Сетевая ошибка. Проверьте подключение.");
        setStatus("error");
      }
    };
    return () => {
      window.__mr_onTelegramLink = undefined;
    };
  }, [onSuccess]);

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
    script.setAttribute("data-onauth", "__mr_onTelegramLink(user)");
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
        title="Подключение Telegram недоступно"
      >
        <div className="space-y-3">
          <p className="text-sm text-text-sec">
            Подключение Telegram временно недоступно. Попробуйте позже или
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
    <ModalSurface open onClose={onClose} title="Подключить Telegram">
      <div className="space-y-4">
        <p className="text-sm text-text-sec">
          Нажмите кнопку ниже, чтобы войти через Telegram и привязать аккаунт.
          После этого мы сможем присылать уведомления в боте.
        </p>

        {/* Hidden widget container — its iframe is what we forward clicks to. */}
        <div
          ref={containerRef}
          className="pointer-events-none absolute opacity-0"
          aria-hidden="true"
        />

        {status === "idle" || status === "error" ? (
          <div className="flex justify-center pt-2">
            <Button
              variant="primary"
              size="md"
              onClick={clickHiddenWidget}
            >
              Войти через Telegram
            </Button>
          </div>
        ) : null}

        {status === "linking" ? (
          <div className="py-4 text-center text-sm text-text-sec">
            Привязываем аккаунт…
          </div>
        ) : null}

        {status === "success" ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2
              className="h-10 w-10 text-emerald-500"
              aria-hidden
            />
            <div className="font-display text-base text-text-main">
              Telegram подключён
            </div>
          </div>
        ) : null}

        {status === "error" && error ? (
          <div className="rounded-xl border border-rose-300/50 bg-rose-50/60 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {status === "success" ? "Закрыть" : "Отмена"}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
