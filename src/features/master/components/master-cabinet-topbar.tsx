"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  ratingLabel: string;
  studioName?: string | null;
  isStudioMember?: boolean;
};

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/cabinet/master/dashboard", label: UI_TEXT.master.topbar.nav.home },
  { href: "/cabinet/master/schedule", label: UI_TEXT.master.topbar.nav.schedule },
  { href: "/cabinet/master/clients", label: UI_TEXT.master.topbar.nav.clients },
  { href: "/cabinet/master/reviews", label: UI_TEXT.master.topbar.nav.reviews },
  { href: "/cabinet/master/model-offers", label: UI_TEXT.master.topbar.nav.models },
  { href: "/cabinet/master/analytics", label: UI_TEXT.master.topbar.nav.analytics },
];

const ACCOUNT_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/cabinet/master/profile", label: UI_TEXT.master.topbar.nav.profile },
  { href: "/cabinet/master/billing", label: UI_TEXT.master.topbar.nav.billing },
];

function isActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function MasterCabinetTopbar({ ratingLabel, studioName, isStudioMember = false }: Props) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountActive = pathname.startsWith("/cabinet/master/profile") || pathname === "/cabinet/master/billing";

  useEffect(() => {
    if (!accountOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(target)) {
        setAccountOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
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
  }, [accountOpen]);

  return (
    <header className="lux-card rounded-[22px] p-3" data-studio-member={isStudioMember ? "1" : "0"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold">
            {UI_TEXT.master.topbar.brand}
          </Link>

          <nav className="hidden flex-wrap items-center gap-2 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative rounded-xl px-3 py-1.5 text-sm transition-all duration-300",
                    active
                      ? "bg-bg-card pl-4 text-text-main shadow-card before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
                      : "text-text-sec hover:bg-bg-input hover:text-text-main"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-border-subtle bg-bg-input px-2.5 py-1 text-xs text-text-main">
            {ratingLabel}
          </span>
          {studioName ? (
            <span className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1.5 text-sm text-text-sec">
              {studioName}
            </span>
          ) : null}

          <div className="relative" ref={accountMenuRef}>
            <Button
              type="button"
              variant={accountActive ? "secondary" : "icon"}
              size="icon"
              aria-label={UI_TEXT.master.topbar.nav.profile}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((current) => !current)}
            >
              <Settings className="h-4 w-4" aria-hidden />
            </Button>
            {accountOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 min-w-[180px] rounded-2xl border border-border-subtle bg-bg-card/95 p-2 shadow-card backdrop-blur">
                {ACCOUNT_ITEMS.map((item) => {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAccountOpen(false)}
                      className="block rounded-xl px-3 py-2 text-sm text-text-main transition-colors hover:bg-bg-input"
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <nav className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative whitespace-nowrap rounded-xl px-3 py-1.5 text-sm transition-all duration-300",
                active
                  ? "bg-bg-card pl-4 text-text-main shadow-card before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
                  : "text-text-sec hover:bg-bg-input hover:text-text-main"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
