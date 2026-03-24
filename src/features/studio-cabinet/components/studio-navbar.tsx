"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const NAV_ITEMS = [
  { href: "/cabinet/studio", label: UI_TEXT.studioCabinet.nav.home },
  { href: "/cabinet/studio/calendar", label: UI_TEXT.studioCabinet.nav.calendar },
  { href: "/cabinet/studio/team", label: UI_TEXT.studioCabinet.nav.team },
  { href: "/cabinet/studio/clients", label: UI_TEXT.studioCabinet.nav.clients },
  { href: "/cabinet/studio/reviews", label: UI_TEXT.studioCabinet.dashboard.cards.reviews },
  { href: "/cabinet/studio/analytics", label: UI_TEXT.studioCabinet.nav.analytics },
  { href: "/cabinet/studio/finance", label: UI_TEXT.studioCabinet.nav.finance },
];

const ADMIN_ITEMS = [
  { href: "/cabinet/studio/settings", label: UI_TEXT.studioCabinet.nav.settingsAria },
  { href: "/cabinet/billing?scope=STUDIO", label: UI_TEXT.studioCabinet.nav.billing },
];

type Props = {
  studioName: string;
  publicHref: string;
  publicHint?: string | null;
};

function isActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  if (path === "/cabinet/studio") return pathname === path;
  return pathname.startsWith(`${path}/`) || pathname === path;
}

export function StudioNavbar({ studioName, publicHref, publicHint }: Props) {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/cabinet/studio/settings") || pathname === "/cabinet/billing";
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!adminOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!adminRef.current) return;
      if (!adminRef.current.contains(target)) {
        setAdminOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAdminOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [adminOpen]);

  return (
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

        <div className="relative" ref={adminRef}>
          <Button
            type="button"
            variant={settingsActive ? "secondary" : "icon"}
            size="icon"
            aria-label={UI_TEXT.studioCabinet.nav.settingsAria}
            aria-haspopup="menu"
            aria-expanded={adminOpen}
            onClick={() => setAdminOpen((current) => !current)}
          >
            {"\u2699\ufe0f"}
          </Button>
          {adminOpen ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-30 min-w-[180px] rounded-2xl border border-border-subtle bg-bg-card/95 p-2 shadow-card backdrop-blur">
              {ADMIN_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setAdminOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm text-text-main transition-colors hover:bg-bg-input"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
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

