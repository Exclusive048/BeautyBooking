"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type TelegramAuthUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

type TelegramLoginButtonProps = {
  iconOnly?: boolean;
  className?: string;
  showConfigError?: boolean;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthUser) => void;
  }
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export default function TelegramLoginButton({
  iconOnly = false,
  className,
  showConfigError = true,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didInitRef = useRef(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const label = UI_TEXT.auth.telegram.loginButton;

  useEffect(() => {
    if (window.onTelegramAuth) return;

    window.onTelegramAuth = async (user: TelegramAuthUser) => {
      setErrorText(null);
      setLoading(true);
      try {
        const res = await fetch("/api/auth/telegram/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });

        const json = (await res.json().catch(() => null)) as ApiResponse<{ redirect: string }> | null;
        if (!res.ok || !json || !json.ok) {
          setErrorText(json && !json.ok ? json.error.message : UI_TEXT.auth.telegram.loginFailed);
          return;
        }

        window.location.assign(json.data.redirect);
      } finally {
        setLoading(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!botUsername) return;
    if (!containerRef.current) return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    containerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    containerRef.current.appendChild(script);
  }, [botUsername]);

  function handleClick() {
    const iframe = containerRef.current?.querySelector("iframe") as HTMLIFrameElement | null;
    if (!iframe) return;

    try {
      iframe.contentWindow?.document.querySelector("button")?.click();
    } catch {
      // Ignore cross-origin access errors.
    }

    iframe.click();
  }

  const iconOnlyButton = (
    <button
      type="button"
      onClick={botUsername ? handleClick : undefined}
      disabled={!botUsername || loading}
      aria-label={label}
      title={botUsername ? label : UI_TEXT.auth.telegram.botNotConfigured}
      className={cn(className, !botUsername && "opacity-50")}
    >
      <TelegramIcon className="h-5 w-5 text-[#2AABEE]" />
      <span className="sr-only">{loading ? UI_TEXT.common.loading : label}</span>
    </button>
  );

  if (!botUsername) {
    if (iconOnly) return iconOnlyButton;

    return (
      <div className="space-y-2">
        <button
          type="button"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-border-subtle/80 bg-bg-input px-4 text-sm font-medium text-text-main opacity-50"
          aria-label={label}
          disabled
        >
          <TelegramIcon className="h-4 w-4 text-[#2AABEE]" />
          {label}
        </button>
        {showConfigError ? <div className="text-xs text-red-500">{UI_TEXT.auth.telegram.botNotConfigured}</div> : null}
      </div>
    );
  }

  if (iconOnly) {
    return (
      <>
        <div ref={containerRef} className="pointer-events-none absolute opacity-0" aria-hidden="true" />
        {iconOnlyButton}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="pointer-events-none absolute opacity-0" aria-hidden="true" />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label={label}
        className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border-subtle/80 bg-bg-input px-4 text-sm font-medium text-text-main shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition hover:bg-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/45 disabled:pointer-events-none disabled:opacity-50"
      >
        <TelegramIcon className="h-4 w-4 text-[#2AABEE]" />
        {loading ? UI_TEXT.common.loading : label}
      </button>

      {errorText ? <div className="text-center text-xs text-red-500">{errorText}</div> : null}
    </div>
  );
}

