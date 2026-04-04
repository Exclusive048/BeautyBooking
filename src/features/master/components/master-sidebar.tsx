"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  Users,
  Star,
  BarChart3,
  User,
  CreditCard,
  Sparkles,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  ratingLabel: string;
  publicUsername?: string | null;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/cabinet/master/dashboard", label: UI_TEXT.master.topbar.nav.home, icon: LayoutDashboard, exact: true },
  { href: "/cabinet/master/dashboard", label: UI_TEXT.master.topbar.nav.bookings, icon: Calendar },
  { href: "/cabinet/master/schedule", label: UI_TEXT.master.topbar.nav.schedule, icon: Clock },
  { href: "/cabinet/master/clients", label: UI_TEXT.master.topbar.nav.clients, icon: Users },
  { href: "/cabinet/master/reviews", label: UI_TEXT.master.topbar.nav.reviews, icon: Star },
  { href: "/cabinet/master/model-offers", label: UI_TEXT.master.topbar.nav.models, icon: Sparkles },
  { href: "/cabinet/master/analytics", label: UI_TEXT.master.topbar.nav.analytics, icon: BarChart3 },
  { href: "/cabinet/master/profile", label: UI_TEXT.master.topbar.nav.profile, icon: User },
  { href: "/cabinet/master/billing", label: UI_TEXT.master.topbar.nav.billing, icon: CreditCard },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  const path = href.split("?")[0] ?? href;
  if (exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function MasterSidebar({ ratingLabel, publicUsername }: Props) {
  const pathname = usePathname();
  const t = UI_TEXT.master;

  return (
    <aside className="flex w-64 flex-col bg-bg-card">
      {/* Logo */}
      <div className="shrink-0 border-b border-border-subtle px-5 py-4">
        <Link href="/" className="text-base font-bold text-text-main transition hover:text-primary">
          {t.topbar.brand}
        </Link>
      </div>

      {/* Rating badge */}
      <div className="shrink-0 px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2">
          <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
          <span className="text-sm font-medium text-text-main">{ratingLabel}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-3 py-2" aria-label="Навигация кабинета">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const Icon = item.icon;
            return (
              <li key={`${item.href}-${item.label}`}>
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
        </ul>
      </nav>

      {/* My page link */}
      {publicUsername ? (
        <div className="mt-6 px-3 pb-3">
          <Link
            href={`/u/${publicUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-text-sec transition hover:bg-bg-input hover:text-text-main"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            {t.sidebar.myPage}
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
