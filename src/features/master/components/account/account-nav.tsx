"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Shield, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.tabs;

const BASE = "/cabinet/master/account";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Bell;
};

const ITEMS: ReadonlyArray<NavItem> = [
  { href: `${BASE}/notifications`, label: T.notifications, icon: Bell },
  { href: `${BASE}/security`, label: T.security, icon: Shield },
  { href: `${BASE}/account`, label: T.account, icon: User },
];

/**
 * fix-04a: account settings moved from `?tab=` query state to real
 * sub-routes (`/account/{notifications,security,account}`). Replaces
 * the previous `<AccountTabs>` query-driven switcher — URLs are now
 * bookmarkable and each section is its own page.
 *
 * The nav itself is a client component only because it reads
 * `usePathname()` to highlight the active link; the sub-pages remain
 * fully server-rendered.
 */
export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap items-center gap-1 overflow-x-auto rounded-2xl border border-border-subtle bg-bg-card p-1"
      aria-label="account-nav"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive
                ? "bg-bg-input text-text-main shadow-card"
                : "text-text-sec hover:text-text-main",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
