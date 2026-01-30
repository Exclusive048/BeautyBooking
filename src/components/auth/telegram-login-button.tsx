"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

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

  // 1) Ставим callback ОДИН РАЗ. В cleanup НЕ удаляем (StrictMode в dev делает mount/unmount/mount).
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

        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ redirect: string }>
          | null;

        if (!res.ok || !json || !json.ok) {
          const msg =
            json && !json.ok
              ? json.error.message
              : "Не удалось войти через Telegram";
          setErrorText(msg);
          return;
        }

        window.location.assign(json.data.redirect);
      } finally {
        setLoading(false);
      }
    };
  }, []);

  // 2) Вставляем Telegram script в DOM руками, а не через JSX.
  useEffect(() => {
    if (!botUsername) return;
    if (!containerRef.current) return;

    // Защита от повторной инициализации (StrictMode/перерисовки)
    if (didInitRef.current) return;
    didInitRef.current = true;

    // Очищаем контейнер (только внутренности!)
    containerRef.current.innerHTML = "";

    // Важно: Telegram виджет грузится через script tag
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";

    // data-* атрибуты
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");

    containerRef.current.appendChild(script);
  }, [botUsername]);

  // SSR-safe: всегда одинаковая разметка без <script> в JSX
  if (!botUsername) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className="w-full rounded-xl border py-2 font-medium opacity-60"
          disabled
        >
          Войти через Telegram
        </button>
        <div className="text-xs text-red-600">
          Telegram bot username не настроен.
        </div>
      </div>
    );
  }

return (
  <div className="space-y-2">
    <div
      className={`flex justify-center ${
        loading ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      {/* Стабильный контейнер, в него вставляется Telegram widget */}
      <div ref={containerRef} />
    </div>

    {errorText ? (
      <div className="text-xs text-red-600 text-center">{errorText}</div>
    ) : null}
  </div>
);

}
