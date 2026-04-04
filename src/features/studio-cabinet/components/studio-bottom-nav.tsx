"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Users, UserCircle, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type TabItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const TABS: TabItem[] = [
  { href: "/cabinet/studio", label: UI_TEXT.studioCabinet.nav.home, icon: LayoutDashboard, exact: true },
  { href: "/cabinet/studio/calendar", label: UI_TEXT.studioCabinet.nav.calendar, icon: CalendarDays },
  { href: "/cabinet/studio/team", label: UI_TEXT.studioCabinet.nav.team, icon: Users },
  { href: "/cabinet/studio/clients", label: UI_TEXT.studioCabinet.nav.clients, icon: UserCircle },
];

const MORE_PATHS = [
  "/cabinet/studio/reviews",
  "/cabinet/studio/finance",
  "/cabinet/studio/analytics",
  "/cabinet/studio/settings",
  "/cabinet/studio/billing",
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  const path = href.split("?")[0] ?? href;
  if (exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isMoreActive(pathname: string): boolean {
  return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function StudioBottomNav() {
  const pathname = usePathname();
  const moreActive = isMoreActive(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Навигация студии"
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
                  <span className={cn("text-[10px] font-medium", active ? "text-primary" : "text-text-sec")}>
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          })}

          {/* More */}
          <li className="flex-1">
            <Link
              href="/cabinet/studio/reviews"
              className="flex flex-col items-center gap-0.5 px-1 py-2.5 transition-colors"
              aria-current={moreActive ? "page" : undefined}
            >
              <MoreHorizontal
                className={cn("h-5 w-5", moreActive ? "text-primary" : "text-text-sec")}
                aria-hidden
              />
              <span className={cn("text-[10px] font-medium", moreActive ? "text-primary" : "text-text-sec")}>
                {UI_TEXT.master.topbar.nav.more}
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
