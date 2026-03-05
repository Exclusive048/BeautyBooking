"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const NAV_ITEMS = [
  { href: "/cabinet/studio", label: UI_TEXT.studioCabinet.nav.home },
  { href: "/cabinet/studio/calendar", label: UI_TEXT.studioCabinet.nav.calendar },
  { href: "/cabinet/studio/team", label: UI_TEXT.studioCabinet.nav.team },
  { href: "/cabinet/studio/clients", label: UI_TEXT.studioCabinet.nav.clients },
  { href: "/cabinet/studio/analytics", label: UI_TEXT.studioCabinet.nav.analytics },
  { href: "/cabinet/studio/finance", label: UI_TEXT.studioCabinet.nav.finance },
  { href: "/cabinet/billing", label: UI_TEXT.studioCabinet.nav.billing },
];

type Props = {
  studioName: string;
  publicHref: string;
  publicHint?: string | null;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/cabinet/studio") return pathname === href;
  return pathname.startsWith(`${href}/`) || pathname === href;
}

export function StudioNavbar({ studioName, publicHref, publicHint }: Props) {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/cabinet/studio/settings");

  return (
    // top-[var(--topbar-h)] — прилипает строго под топбаром (72px)
    // z-20 — ниже топбара (z-30), чтобы не перекрывать кнопку профиля
    <div className="sticky top-[var(--topbar-h)] z-20 w-full px-4">
      <div className="glass-panel mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-[24px] px-4">
        <div className="flex items-baseline gap-2">
          <Link
            href={publicHref}
            className="text-sm font-semibold text-text-main transition hover:text-text-main/80"
          >
            {studioName}
          </Link>
          {publicHint ? <span className="text-[11px] text-text-sec">{publicHint}</span> : null}
        </div>

        <nav className="hidden items-center gap-2 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300",
                  active
                    ? "bg-bg-card/80 pl-4 text-text-main shadow-card before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
                    : "text-text-sec hover:bg-bg-input/70 hover:text-text-main"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Button
          asChild
          variant={settingsActive ? "secondary" : "icon"}
          size="icon"
          aria-label={UI_TEXT.studioCabinet.nav.settingsAria}
        >
          <Link href="/cabinet/studio/settings">⚙</Link>
        </Button>
      </div>

      <nav className="mx-auto mt-3 flex w-full max-w-6xl items-center gap-2 overflow-x-auto pb-1 md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300",
                active
                  ? "bg-bg-card/80 pl-4 text-text-main shadow-card before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
                  : "text-text-sec hover:bg-bg-input/70 hover:text-text-main"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
