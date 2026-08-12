"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { withConsentQuery, type SocialConsent } from "@/components/auth/social-consent";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { env } from "@/lib/env";

type TelegramLoginButtonProps = {
  iconOnly?: boolean;
  className?: string;
  showConfigError?: boolean;
  /**
   * RKN-FIX-01 — parity with VK/Yandex. Telegram login creates profiles too
   * (`authenticateTelegramLogin`), so the widget is not initialised until the
   * required boxes are ticked, and the flags ride the `login-init` fetch that
   * mints the single-use nonce. Telegram itself stays kill-switched off
   * (FZ-199); this keeps the gap from reopening if it is ever re-enabled.
   */
  consent?: SocialConsent;
  /**
   * QA-001: bot username resolved SERVER-side and passed down, so the rendered
   * branch is identical on server + client (no hydration mismatch). Reading
   * `env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` directly here returns the real value
   * on the server but `undefined` on the client (the `env` alias defeats Next's
   * static `process.env.NEXT_PUBLIC_*` inlining) → divergent markup. When the
   * prop is provided (any string incl. ""), it wins; callers that omit it keep
   * the legacy env fallback (still latent until the env.ts root fix).
   */
  botUsername?: string;
};

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
  botUsername: botUsernameProp,
  consent,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didInitRef = useRef(false);
  // Omitted prop → legacy behaviour (no consent gate); provided → the widget
  // waits for the required boxes.
  const consentGranted = consent === undefined || consent.granted;
  const consentQuery = consent?.query ?? "";

  // QA-001: prefer the server-passed prop (deterministic across SSR/CSR); fall
  // back to env only for callers that don't pass it.
  const botUsername =
    botUsernameProp !== undefined ? botUsernameProp : env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const label = UI_TEXT.auth.telegram.loginButton;

  useEffect(() => {
    if (!botUsername) return;
    // RKN-FIX-01: no consent → no nonce → no widget. `/login-init` refuses
    // without the required flags anyway, so initialising early would just burn
    // a 400 and leave a widget wired to a nonce-less auth URL.
    if (!consentGranted) return;
    const container = containerRef.current;
    if (!container) return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    let cancelled = false;

    // FIX-9 (HARDENING-06): fetch a single-use login nonce (the server sets an
    // HttpOnly state cookie) and round-trip it via `data-auth-url=...?s=<nonce>`
    // so a captured Telegram payload can't force-login another browser. On any
    // failure we append WITHOUT a nonce — the GET then rejects (fail-closed).
    void (async () => {
      let authUrl = "/api/auth/telegram/login";
      try {
        const res = await fetch(withConsentQuery("/api/auth/telegram/login-init", consentQuery ? { granted: true, query: consentQuery } : undefined), {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { data?: { state?: string } }
            | null;
          const state = payload?.data?.state;
          if (state) {
            authUrl = `/api/auth/telegram/login?s=${encodeURIComponent(state)}`;
          }
        }
      } catch {
        // Network error — leave authUrl without a nonce (the GET will reject).
      }
      if (cancelled) return;

      container.innerHTML = "";
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-userpic", "false");
      // FIX-23 (CSP unsafe-eval): redirect mode (`data-auth-url`) instead of the
      // callback mode (`data-onauth`). `data-onauth` makes telegram-widget.js
      // compile the callback string via `new Function`/`eval` at widget-init —
      // the prod-only `unsafe-eval` pageerror on /login under strict-dynamic CSP.
      // In redirect mode the widget navigates to this GET callback with the
      // signed auth params; the server verifies the HMAC and issues the session.
      script.setAttribute("data-auth-url", authUrl);
      container.appendChild(script);
    })();

    return () => {
      cancelled = true;
    };
  }, [botUsername, consentGranted, consentQuery]);

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
    // UI-26 — та же форма, что у VK/Yandex. Безусловный `opacity-50` заменён
    // на `disabled:opacity-50` базы: обе ветки, гасившие иконку, и так
    // выставляют `disabled`, поэтому условие было дублем самого себя.
    <Button
      variant="wrapper"
      size="none"
      onClick={botUsername && consentGranted ? handleClick : undefined}
      disabled={!botUsername || !consentGranted}
      aria-label={label}
      title={botUsername ? label : UI_TEXT.auth.telegram.botNotConfigured}
      className={cn(className)}
    >
      <TelegramIcon className="h-5 w-5 text-[#2AABEE]" />
      <span className="sr-only">{label}</span>
    </Button>
  );

  // Not configured, or consent not yet given → the same inert control. The
  // config error message stays scoped to the missing-bot case.
  if (!botUsername || !consentGranted) {
    if (iconOnly) return iconOnlyButton;

    return (
      <div className="space-y-2">
        {/* UI-26: `secondary` + `size="lg"` — дословно то, чем рендерятся
            неактивные VK и Yandex. Собранная вручную копия расходилась с ними
            высотой (h-10 против h-12 у `size="lg"`), а стоят все три в одном
            стеке на `/login`: при снятии FZ-199-килсвитча ряд был бы рваным. */}
        <Button variant="secondary" size="lg" className="w-full gap-2" disabled aria-label={label}>
          <TelegramIcon className="h-4 w-4 text-[#2AABEE]" />
          {label}
        </Button>
        {!botUsername && showConfigError ? (
          // UI-27: `text-red-500` — литерал вне тем; статусный текст берёт
          // ратифицированный токен (светлая red-700 / тёмная red-300).
          <div className="text-xs text-danger-text">{UI_TEXT.auth.telegram.botNotConfigured}</div>
        ) : null}
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
      {/* UI-26 — активная ветка, тот же `secondary`/`lg`, что у VK и Yandex. */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full cursor-pointer gap-2"
        onClick={handleClick}
        aria-label={label}
      >
        <TelegramIcon className="h-4 w-4 text-[#2AABEE]" />
        {label}
      </Button>
    </div>
  );
}

