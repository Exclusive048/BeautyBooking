"use client";

import { useEffect, useRef, useState } from "react";
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

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthUser) => void;
  }
}

export default function TelegramLoginButton() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didInitRef = useRef(false);

  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

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

  if (!botUsername) {
    return (
      <div className="space-y-2">
        <button type="button" className="w-full rounded-xl border py-2 font-medium opacity-60" disabled>
          {UI_TEXT.auth.telegram.loginButton}
        </button>
        <div className="text-xs text-red-600">{UI_TEXT.auth.telegram.botNotConfigured}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`flex justify-center ${loading ? "pointer-events-none opacity-60" : ""}`}>
        <div ref={containerRef} />
      </div>

      {errorText ? <div className="text-center text-xs text-red-600">{errorText}</div> : null}
    </div>
  );
}

