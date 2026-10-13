import type { ReactNode } from "react";
import { PRESS } from "@/components/ui/motion-classes";
import { TelegramIcon } from "@/components/ui/telegram-icon";
import { VkIcon } from "@/components/ui/vk-icon";
import * as UI_TEXT from "@/lib/ui/text";
import { env, isTelegramEnabled } from "@/lib/env";

type SocialLink = {
  label: string;
  href: string;
  icon: ReactNode;
};

// FIX-VK-GLYPH: знак приходит из единственного источника
// (`components/ui/vk-icon.tsx`). Прежний рукописный путь жил здесь дословным
// дублем с `provider-social-links.tsx` и был обведён на глаз — кривой «V» и
// нарост слева внизу.
const VK_ICON = <VkIcon className="h-5 w-5" />;

// SOCIAL-TG-MAX: тот же знак, что у ссылки на канал в публичных профилях.
const TELEGRAM_ICON = <TelegramIcon className="h-5 w-5" />;

// FOOTER-VK: the VK community link is env-driven (NEXT_PUBLIC_VK_COMMUNITY_URL).
// The old hardcoded `vk.com/beautyhub` was a stale pre-rebrand handle. When the
// env var is unset we OMIT the VK icon rather than link a wrong handle — set the
// real МастерРядом community URL in prod env (deploy-checklist «social links»).
const vkCommunityUrl = env.NEXT_PUBLIC_VK_COMMUNITY_URL?.trim();

const socials: SocialLink[] = [
  ...(vkCommunityUrl
    ? [{ label: UI_TEXT.footer.socials.vk, href: vkCommunityUrl, icon: VK_ICON }]
    : []),
  // FIX-TELEGRAM-KILLSWITCH: the Telegram footer link is omitted when the flag
  // is off (env hard ceiling — readable here client + server).
  ...(isTelegramEnabled
    ? [{ label: UI_TEXT.footer.socials.telegram, href: "https://t.me/masterryadom_news", icon: TELEGRAM_ICON }]
    : []),
];

export function FooterSocials() {
  return (
    <div className="flex items-center gap-3">
      {socials.map((social) => (
        <a
          key={social.label}
          href={social.href}
          aria-label={social.label}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle/80 bg-bg-input text-text-sec transition-all duration-200 hover:border-primary/40 hover:bg-bg-card hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${PRESS}`}
        >
          {social.icon}
        </a>
      ))}
    </div>
  );
}
