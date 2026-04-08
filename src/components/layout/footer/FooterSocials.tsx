import type { ReactNode } from "react";
import { UI_TEXT } from "@/lib/ui/text";

type SocialLink = {
  label: string;
  href: string;
  icon: ReactNode;
};

const socials: SocialLink[] = [
  {
    label: UI_TEXT.footer.socials.vk,
    href: "https://vk.com/beautyhub",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          fill="currentColor"
          d="M4.8 6.5h3.2c.2 0 .4.1.5.3.2.6 1 2.6 2.1 3.9.4.4.6.5.8.5.1 0 .3-.1.4-.3.1-.4.2-1.4.1-2.5 0-.3-.2-.6-.5-.7-.2-.1-.5-.1-.3-.4.1-.2.6-.5 1.9-.5 2 0 2.7.4 2.9.7.3.4.2 1.2.2 2.2 0 .7-.1 1.6.2 1.9.2.2.4.3.6.3.3 0 .6-.2 1-.6 1.2-1.4 2.2-3.6 2.2-3.6.1-.2.3-.4.6-.4h3.1c.3 0 .5.2.4.6-.2.8-1.7 3.4-3.4 5.6-.9 1.2-.9 1.7.1 2.6.7.7 1.6 1.3 2.2 2 .4.5.7 1 .6 1.6 0 .3-.3.5-.6.5h-2.7c-.6 0-.9-.2-1.5-.7-.6-.6-1.3-1.4-2-2.3-.3-.4-.5-.6-.8-.6-.2 0-.4.2-.5.7-.2.6-.2 1.6-.2 2.4 0 .3-.2.5-.5.5h-3.2c-.2 0-.4 0-.6-.1-1.3-.4-2.8-1.5-3.8-3.1-1.6-2.5-2.8-5.6-3-7.8 0-.3.2-.5.5-.5Z"
        />
      </svg>
    ),
  },
  {
    label: UI_TEXT.footer.socials.telegram,
    href: "https://t.me/masterryadom_news",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          fill="currentColor"
          d="M21.3 4.6c.3-.1.6.1.6.4 0 .1 0 .2-.1.3l-3.2 15.2c-.1.4-.5.6-.9.4l-4.5-3.4-2.4 2.3c-.3.3-.8.1-.8-.3v-3.9l8.4-7.6c.2-.2 0-.5-.3-.4l-10.4 6.2-4.2-1.4c-.4-.1-.4-.6 0-.8Z"
        />
      </svg>
    ),
  },
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle/80 bg-bg-input text-text-sec transition-all duration-200 hover:scale-105 hover:border-primary/40 hover:bg-bg-card hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
        >
          {social.icon}
        </a>
      ))}
    </div>
  );
}
