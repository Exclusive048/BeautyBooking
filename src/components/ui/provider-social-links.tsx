import type { ReactNode } from "react";
import { PRESS } from "@/components/ui/motion-classes";
import { cn } from "@/lib/cn";
import { VkIcon } from "@/components/ui/vk-icon";
import { safeSocialHref } from "@/lib/providers/social-links";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * FEAT-PROVIDER-SOCIALS — public VK / Instagram community-link icons, shared by
 * the studio and master public profiles. Rendered ONLY when a link is set.
 *
 * 🔴 SECURITY: each stored value is re-run through `safeSocialHref`
 * (defense-in-depth) so a manually-corrupted DB row can never emit a dangerous
 * href — only a host+scheme-locked `https://vk.com|instagram.com/...` link
 * survives. Links open in a new tab with `rel="noopener noreferrer"`.
 */

// FIX-VK-GLYPH: знак приходит из единственного источника
// (`components/ui/vk-icon.tsx`). Прежний рукописный путь жил здесь дословным
// дублем с `layout/footer/FooterSocials.tsx` и был обведён на глаз — кривой «V» и
// нарост слева внизу.
const VK_ICON = <VkIcon className="h-5 w-5" />;

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
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-control bg-bg-input text-text-sec transition-all duration-200 hover:border-primary/40 hover:bg-bg-card hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${PRESS}`}
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
