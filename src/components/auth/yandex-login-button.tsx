"use client";

import { Button } from "@/components/ui/button";
import { withConsentQuery, type SocialConsent } from "@/components/auth/social-consent";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { isYandexAuthEnabled } from "@/lib/env";

// FIX-YANDEX-OAUTH — login button, bespoke-parallel to VkLoginButton.
type YandexLoginButtonProps = {
  iconOnly?: boolean;
  className?: string;
  /** RKN-FIX-01 — see `VkLoginButton.consent`; identical contract. */
  consent?: SocialConsent;
  /**
   * QA-001: Yandex-enabled flag resolved SERVER-side and passed down so server +
   * client render the same branch (avoids the env-via-alias hydration mismatch).
   * When provided the prop wins; omitting it falls back to the computed flag.
   */
  enabled?: boolean;
};

function YandexIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.49 0C4.476 0 1.05 3.426 1.05 8.44c0 3.55 1.736 6.293 4.764 7.795L1.05 24h3.74l4.36-7.34h1.32V24h3.18V0H9.49zm.16 13.84h-.66c-2.49 0-3.74-1.42-3.74-5.4 0-4.14 1.42-5.46 3.74-5.46h.66v10.86z" />
    </svg>
  );
}

export default function YandexLoginButton({
  iconOnly = false,
  className,
  enabled,
  consent,
}: YandexLoginButtonProps) {
  // QA-001: prefer the server-passed prop (deterministic across SSR/CSR).
  const yandexEnabled = enabled !== undefined ? enabled : isYandexAuthEnabled;
  if (!yandexEnabled) return null;

  const label = UI_TEXT.auth.yandex.loginButton;
  const blockedByConsent = consent !== undefined && !consent.granted;
  const href = withConsentQuery("/api/auth/yandex/start", consent);

  // RKN-FIX-01 — inert until the required boxes are ticked (VK parity).
  if (blockedByConsent) {
    if (iconOnly) {
      return (
        // UI-26: `wrapper` — весь вид приходит из `className` вызывающего, а
        // гашение даёт `disabled:opacity-50` базы, поэтому прежний безусловный
        // `opacity-50` не нужен (он гасил бы и не-disabled состояние, если бы
        // ветка когда-нибудь стала рендериться живой).
        <Button variant="wrapper" size="none" disabled aria-label={label} title={label} className={cn(className)}>
          <YandexIcon className="h-5 w-5 text-[#FC3F1D]" />
          <span className="sr-only">{label}</span>
        </Button>
      );
    }
    return (
      <Button variant="secondary" size="lg" className="w-full gap-2" disabled aria-label={label}>
        <YandexIcon className="h-4 w-4 text-[#FC3F1D]" />
        {label}
      </Button>
    );
  }

  // FIX-24 parity: plain <a>, NOT next/link. `/api/auth/yandex/start` 302s to
  // oauth.yandex.ru — a next/link would RSC-prefetch it (cross-origin → CORS)
  // and can't follow the external redirect. A top-level anchor follows cleanly.
  if (iconOnly) {
    return (
      <a href={href} aria-label={label} title={label} className={cn(className)}>
        <YandexIcon className="h-5 w-5 text-[#FC3F1D]" />
        <span className="sr-only">{label}</span>
      </a>
    );
  }

  return (
    <Button asChild variant="secondary" size="lg" className="w-full gap-2">
      <a href={href} aria-label={label}>
        <YandexIcon className="h-4 w-4 text-[#FC3F1D]" />
        {label}
      </a>
    </Button>
  );
}
