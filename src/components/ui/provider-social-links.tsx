import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { safeSocialHref } from "@/lib/providers/social-links";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * FEAT-PROVIDER-SOCIALS — public VK / Instagram community-link icons, shared by
 * the studio and master public profiles. Rendered ONLY when a link is set.
 *
 * 🔴 SECURITY: each stored value is re-run through `safeSocialHref`
 * (defense-in-depth) so a manually-corrupted DB row can never emit a dangerous
 * href — only a host+scheme-locked `https://vk.com|instagram.com/...` link
 * survives. Links open in a new tab with `rel="noopener noreferrer"`.
 */

const VK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
    <path
      fill="currentColor"
      d="M4.8 6.5h3.2c.2 0 .4.1.5.3.2.6 1 2.6 2.1 3.9.4.4.6.5.8.5.1 0 .3-.1.4-.3.1-.4.2-1.4.1-2.5 0-.3-.2-.6-.5-.7-.2-.1-.5-.1-.3-.4.1-.2.6-.5 1.9-.5 2 0 2.7.4 2.9.7.3.4.2 1.2.2 2.2 0 .7-.1 1.6.2 1.9.2.2.4.3.6.3.3 0 .6-.2 1-.6 1.2-1.4 2.2-3.6 2.2-3.6.1-.2.3-.4.6-.4h3.1c.3 0 .5.2.4.6-.2.8-1.7 3.4-3.4 5.6-.9 1.2-.9 1.7.1 2.6.7.7 1.6 1.3 2.2 2 .4.5.7 1 .6 1.6 0 .3-.3.5-.6.5h-2.7c-.6 0-.9-.2-1.5-.7-.6-.6-1.3-1.4-2-2.3-.3-.4-.5-.6-.8-.6-.2 0-.4.2-.5.7-.2.6-.2 1.6-.2 2.4 0 .3-.2.5-.5.5h-3.2c-.2 0-.4 0-.6-.1-1.3-.4-2.8-1.5-3.8-3.1-1.6-2.5-2.8-5.6-3-7.8 0-.3.2-.5.5-.5Z"
    />
  </svg>
);

const INSTAGRAM_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
  </svg>
);

type Props = {
  vk: string | null | undefined;
  instagram: string | null | undefined;
  className?: string;
};

type ResolvedLink = { key: string; href: string; label: string; icon: ReactNode };

export function ProviderSocialLinks({ vk, instagram, className }: Props) {
  const T = UI_TEXT.social;
  const candidates: Array<{ key: string; href: string | null; label: string; icon: ReactNode }> = [
    { key: "vk", href: safeSocialHref("vk", vk), label: T.vkAria, icon: VK_ICON },
    { key: "instagram", href: safeSocialHref("instagram", instagram), label: T.instagramAria, icon: INSTAGRAM_ICON },
  ];
  const links: ResolvedLink[] = candidates.filter(
    (link): link is ResolvedLink => typeof link.href === "string" && link.href.length > 0,
  );

  if (links.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          aria-label={link.label}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle/80 bg-bg-input text-text-sec transition-all duration-200 hover:scale-105 hover:border-primary/40 hover:bg-bg-card hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
