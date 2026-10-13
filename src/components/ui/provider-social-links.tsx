import type { ReactNode } from "react";
import { MaxIcon } from "@/components/ui/max-icon";
import { PRESS } from "@/components/ui/motion-classes";
import { TelegramIcon } from "@/components/ui/telegram-icon";
import { cn } from "@/lib/cn";
import { VkIcon } from "@/components/ui/vk-icon";
import {
  safeSocialHref,
  SOCIAL_KINDS,
  type SocialKind,
  type SocialLinkValues,
} from "@/lib/providers/social-links";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * FEAT-PROVIDER-SOCIALS — public community/channel-link icons (VK, Instagram,
 * Telegram, MAX), shared by the studio and master public profiles. Rendered
 * ONLY when a link is set; order follows `SOCIAL_KINDS`.
 *
 * 🔴 SECURITY: each stored value is re-run through `safeSocialHref`
 * (defense-in-depth) so a manually-corrupted DB row can never emit a dangerous
 * href — only a host+scheme-locked link of its own kind survives. Links open in
 * a new tab with `rel="noopener noreferrer"`.
 */

// FIX-VK-GLYPH / SOCIAL-TG-MAX: знаки приходят из единственных источников
// (`components/ui/{vk,telegram,max}-icon.tsx`). `Record` по `SocialKind`: новый
// вид ссылки без знака не собирается.
const SOCIAL_ICONS: Record<SocialKind, ReactNode> = {
  vk: <VkIcon className="h-5 w-5" />,
  instagram: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  ),
  telegram: <TelegramIcon className="h-5 w-5" />,
  max: <MaxIcon className="h-5 w-5" />,
};

type Props = {
  links: SocialLinkValues;
  className?: string;
};

export function ProviderSocialLinks({ links, className }: Props) {
  const resolved = SOCIAL_KINDS.flatMap((kind) => {
    const href = safeSocialHref(kind, links[kind]);
    return href ? [{ kind, href }] : [];
  });

  if (resolved.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {resolved.map(({ kind, href }) => (
        <a
          key={kind}
          href={href}
          aria-label={UI_TEXT.social.kinds[kind].aria}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-control bg-bg-input text-text-sec transition-all duration-200 hover:border-primary/40 hover:bg-bg-card hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${PRESS}`}
        >
          {SOCIAL_ICONS[kind]}
        </a>
      ))}
    </div>
  );
}
