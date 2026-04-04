"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, Clock, Users, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type TabItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const TABS: TabItem[] = [
  { href: "/cabinet/master/dashboard", label: UI_TEXT.master.topbar.nav.home, icon: LayoutDashboard, exact: true },
  { href: "/cabinet/master/dashboard", label: UI_TEXT.master.topbar.nav.bookings, icon: Calendar },
  { href: "/cabinet/master/schedule", label: UI_TEXT.master.topbar.nav.schedule, icon: Clock },
  { href: "/cabinet/master/clients", label: UI_TEXT.master.topbar.nav.clients, icon: Users },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  const path = href.split("?")[0] ?? href;
  if (exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isMoreActive(pathname: string): boolean {
  const morePaths = ["/cabinet/master/reviews", "/cabinet/master/model-offers", "/cabinet/master/analytics", "/cabinet/master/profile", "/cabinet/master/billing"];
  return morePaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function MasterBottomNav() {
  const pathname = usePathname();
  const t = UI_TEXT.master.topbar.nav;
  const moreActive = isMoreActive(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Основная навигация"
    >
      <div className="border-t border-border-subtle bg-bg-card/90 backdrop-blur-xl">
        <ul className="flex items-stretch">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href, tab.exact);
            const Icon = tab.icon;
            return (
              <li key={`${tab.href}-${tab.label}`} className="flex-1">
                <Link
                  href={tab.href}
                  className="flex flex-col items-center gap-0.5 px-1 py-2.5 transition-colors"
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn("h-5 w-5", active ? "text-primary" : "text-text-sec")}
                    aria-hidden
                  />
                  <span
                    className={cn("text-[10px] font-medium", active ? "text-primary" : "text-text-sec")}
                  >
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          })}

          {/* More tab — links to reviews as primary "more" destination */}
          <li className="flex-1">
            <Link
              href="/cabinet/master/reviews"
              className="flex flex-col items-center gap-0.5 px-1 py-2.5 transition-colors"
              aria-current={moreActive ? "page" : undefined}
            >
              <MoreHorizontal
                className={cn("h-5 w-5", moreActive ? "text-primary" : "text-text-sec")}
                aria-hidden
              />
              <span
                className={cn("text-[10px] font-medium", moreActive ? "text-primary" : "text-text-sec")}
              >
                {t.more}
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
