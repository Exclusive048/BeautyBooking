"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { href: "/cabinet/master/analytics", label: UI_TEXT.master.topbar.nav.analytics },
  { href: "/cabinet/master/model-offers", label: UI_TEXT.master.topbar.nav.models },
  { href: "/cabinet/master/profile", label: UI_TEXT.master.topbar.nav.profile },
];

const BILLING_NAV_ITEM = { href: "/cabinet/billing?scope=MASTER", label: UI_TEXT.master.topbar.nav.billing };

function isActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function MasterCabinetTopbar({ ratingLabel, studioName, isStudioMember = false }: Props) {
  const pathname = usePathname();
  const navItems = isStudioMember ? NAV_ITEMS : [...NAV_ITEMS.slice(0, 4), BILLING_NAV_ITEM, ...NAV_ITEMS.slice(4)];

  return (
    <header className="lux-card rounded-[22px] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold">
            {UI_TEXT.master.topbar.brand}
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative rounded-xl px-3 py-1.5 text-sm transition-all duration-300 ${
                    active
                      ? "bg-bg-card pl-4 text-text-main shadow-card before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
                      : "text-text-sec hover:bg-bg-input hover:text-text-main"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/cabinet/master/reviews"
              className={`relative rounded-xl px-3 py-1.5 text-sm transition-all duration-300 ${
                isActive(pathname, "/cabinet/master/reviews")
                  ? "bg-bg-card pl-4 text-text-main shadow-card before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta"
                  : "text-text-sec hover:bg-bg-input hover:text-text-main"
              }`}
            >
              {UI_TEXT.master.topbar.reviews} {ratingLabel}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm text-text-sec">
          {studioName ? (
            <span className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1.5">{studioName}</span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

