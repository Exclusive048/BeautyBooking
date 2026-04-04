"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserCircle,
  Star,
  Wallet,
  BarChart3,
  Settings,
  Scissors,
  ExternalLink,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  children?: Array<{ href: string; label: string; queryParam?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/cabinet/studio",
    label: UI_TEXT.studioCabinet.nav.home,
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/cabinet/studio/calendar",
    label: UI_TEXT.studioCabinet.nav.calendar,
    icon: CalendarDays,
  },
  {
    href: "/cabinet/studio/team",
    label: UI_TEXT.studioCabinet.nav.team,
    icon: Users,
  },
  {
    href: "/cabinet/studio/clients",
    label: UI_TEXT.studioCabinet.nav.clients,
    icon: UserCircle,
  },
  {
    href: "/cabinet/studio/reviews",
    label: UI_TEXT.studioCabinet.nav.reviews,
    icon: Star,
  },
  {
    href: "/cabinet/studio/finance",
    label: UI_TEXT.studioCabinet.nav.finance,
    icon: Wallet,
  },
  {
    href: "/cabinet/studio/analytics",
    label: UI_TEXT.studioCabinet.nav.analytics,
    icon: BarChart3,
  },
  {
    href: "/cabinet/studio/settings?tab=services",
    label: UI_TEXT.studioCabinet.nav.services,
    icon: Scissors,
  },
  {
    href: "/cabinet/studio/settings",
    label: UI_TEXT.studioCabinet.nav.settingsAria,
    icon: Settings,
    children: [
      { href: "/cabinet/studio/settings?tab=main", label: UI_TEXT.studioCabinet.settings.profile, queryParam: "main" },
      { href: "/cabinet/studio/settings?tab=services", label: UI_TEXT.studioCabinet.settings.services, queryParam: "services" },
      { href: "/cabinet/studio/settings?tab=portfolio", label: UI_TEXT.studioCabinet.settings.portfolio, queryParam: "portfolio" },
    ],
  },
];

type Props = {
  studioName: string;
  publicHref: string;
  publicHint?: string | null;
};

function isItemActive(pathname: string, tab: string | null, item: NavItem): boolean {
  const path = item.href.split("?")[0] ?? item.href;
  if (item.exact) return pathname === path;
  if (item.children) return pathname.startsWith(path);
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isChildActive(pathname: string, tab: string | null, child: { href: string; queryParam?: string }): boolean {
  const path = child.href.split("?")[0] ?? child.href;
  if (pathname !== path) return false;
  if (!child.queryParam) return true;
  return tab === child.queryParam;
}

export function StudioSidebar({ studioName, publicHref, publicHint }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  return (
    <aside className="flex w-64 flex-col bg-bg-card">
      {/* Logo */}
      <div className="shrink-0 border-b border-border-subtle px-5 py-4">
        <Link href="/" className="text-base font-bold text-text-main transition hover:text-primary">
          {UI_TEXT.master.topbar.brand}
        </Link>
      </div>

      {/* Studio name */}
      <div className="shrink-0 px-4 py-3">
        <Link
          href={publicHref}
          className="block rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2 transition hover:bg-bg-input"
        >
          <div className="truncate text-sm font-semibold text-text-main">{studioName}</div>
          {publicHint ? (
            <div className="mt-0.5 truncate text-[11px] text-text-sec">{publicHint}</div>
          ) : (
            <div className="mt-0.5 text-[11px] text-primary">{UI_TEXT.studioCabinet.nav.settingsAria} →</div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="px-3 py-2" aria-label="Навигация студии">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(pathname, tab, item);
            const Icon = item.icon;

            if (item.children) {
              return (
                <li key={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      active ? "text-primary" : "text-text-sec"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-text-sec")} aria-hidden />
                    {item.label}
                    <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  </div>
                  {/* Submenu always visible (settings is always shown expanded) */}
                  <ul className="ml-7 mt-0.5 space-y-0.5">
                    {item.children.map((child) => {
                      const childActive = isChildActive(pathname, tab, child);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={cn(
                              "block rounded-lg px-3 py-2 text-sm transition-all",
                              childActive
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-text-sec hover:bg-bg-input hover:text-text-main"
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-text-sec hover:bg-bg-input hover:text-text-main"
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-text-sec")}
                    aria-hidden
                  />
                  {item.label}
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}

          {/* Billing — separator before */}
          <li className="pt-2">
            <div className="mb-2 border-t border-border-subtle" />
            <Link
              href="/cabinet/studio/billing"
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                pathname === "/cabinet/studio/billing"
                  ? "bg-primary/10 text-primary"
                  : "text-text-sec hover:bg-bg-input hover:text-text-main"
              )}
            >
              <Wallet className="h-4 w-4 shrink-0" aria-hidden />
              {UI_TEXT.studioCabinet.nav.billing}
            </Link>
          </li>
        </ul>
      </nav>

      {/* Public page link */}
      <div className="mt-6 px-3 pb-3">
        <Link
          href={publicHref}
          target={publicHint ? undefined : "_blank"}
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-text-sec transition hover:bg-bg-input hover:text-text-main"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          {UI_TEXT.studioCabinet.nav.myPage}
        </Link>
      </div>
    </aside>
  );
}
