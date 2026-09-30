"use client";

import { Button } from "@/components/ui/button";
// FIX-VK-GLYPH: марка кнопки входа — из общего модуля знака, чтобы четвёртой
// рукописной копии не появилось.
import { VkBadgeIcon } from "@/components/ui/vk-icon";
import { withConsentQuery, type SocialConsent } from "@/components/auth/social-consent";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

type VkLoginButtonProps = {
  iconOnly?: boolean;
  className?: string;
  /**
   * RKN-FIX-01: VK login can CREATE an account, so it is a registration path
   * and needs consent like any other. Omitted → legacy plain link (the only
   * consent-free case the server allows is an already-signed-in user linking
   * VK to an existing account).
   */
  consent?: SocialConsent;
  /**
   * QA-001 / ENV-SPLIT-01: VK-enabled is SERVER-resolved (`isVkAuthEnabled` =
   * наличие VK client id — секрет, клиенту недоступен) and passed down. The
   * legacy client-side env fallback is gone with NEXT_PUBLIC_VK_ENABLED;
   * omitting the prop renders nothing.
   */
  enabled?: boolean;
};

export default function VkLoginButton({
  iconOnly = false,
  className,
  enabled,
  consent,
}: VkLoginButtonProps) {
  // QA-001 / ENV-SPLIT-01: the server-passed prop is the only source.
  if (!enabled) return null;

  const label = UI_TEXT.auth.vk.loginButton;
  const blockedByConsent = consent !== undefined && !consent.granted;
  const href = withConsentQuery("/api/auth/vk/start", consent);

  // Consent not yet given → a real disabled control, not a link that would be
  // refused server-side. Same treatment on both variants.
  if (blockedByConsent) {
    if (iconOnly) {
      return (
        // UI-26 — зеркало Yandex: `wrapper` + `disabled:opacity-50` из базы.
        <Button variant="wrapper" size="none" disabled aria-label={label} title={label} className={cn(className)}>
          <VkBadgeIcon className="h-5 w-5 text-[#0077FF]" />
          <span className="sr-only">{label}</span>
        </Button>
      );
    }
    return (
      <Button variant="secondary" size="lg" className="w-full gap-2" disabled aria-label={label}>
        <VkBadgeIcon className="h-4 w-4 text-[#0077FF]" />
        {label}
      </Button>
    );
  }

  // FIX-24 (Item 3): plain <a>, NOT next/link. `/api/auth/vk/start` 302s to
  // id.vk.ru — a next/link RSC-prefetches it (cross-origin fetch → CORS error),
  // and a client-side nav can't follow the external redirect. A plain anchor
  // does a top-level browser navigation that follows the redirect cleanly and
  // is never prefetched.
  if (iconOnly) {
    return (
      <a href={href} aria-label={label} title={label} className={cn(className)}>
        <VkBadgeIcon className="h-5 w-5 text-[#0077FF]" />
        <span className="sr-only">{label}</span>
      </a>
    );
  }

  return (
    <Button asChild variant="secondary" size="lg" className="w-full gap-2">
      <a href={href} aria-label={label}>
        <VkBadgeIcon className="h-4 w-4 text-[#0077FF]" />
        {label}
      </a>
    </Button>
  );
}

