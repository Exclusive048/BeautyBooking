"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  Building2,
  Image,
  Sparkles,
  Share2,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { LockBadge } from "@/components/billing/PaywallCard";

// ── Types ────────────────────────────────────────────────────────────────────

type SettingsChild = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Feature key that must be enabled; if not, show lock */
  featureKey?: "analytics_dashboard" | "financeReport";
};

// ── Nav items ────────────────────────────────────────────────────────────────

const MAIN_NAV: NavItem[] = [
  { href: "/cabinet/studio", label: UI_TEXT.studioCabinet.nav.home, icon: LayoutDashboard, exact: true },
  { href: "/cabinet/studio/calendar", label: UI_TEXT.studioCabinet.nav.calendar, icon: CalendarDays },
  { href: "/cabinet/studio/team", label: UI_TEXT.studioCabinet.nav.team, icon: Users },
  { href: "/cabinet/studio/services", label: UI_TEXT.studioCabinet.nav.services, icon: Scissors },
  { href: "/cabinet/studio/clients", label: UI_TEXT.studioCabinet.nav.clients, icon: UserCircle },
  { href: "/cabinet/studio/reviews", label: UI_TEXT.studioCabinet.nav.reviews, icon: Star },
  {
    href: "/cabinet/studio/finance",
    label: UI_TEXT.studioCabinet.nav.finance,
    icon: Wallet,
    featureKey: "financeReport",
  },
  {
    href: "/cabinet/studio/analytics",
    label: UI_TEXT.studioCabinet.nav.analytics,
    icon: BarChart3,
    featureKey: "analytics_dashboard",
  },
];

const SETTINGS_CHILDREN: SettingsChild[] = [
  { href: "/cabinet/studio/settings/profile", label: UI_TEXT.studioCabinet.settings.profile, icon: Building2 },
  { href: "/cabinet/studio/settings/portfolio", label: UI_TEXT.studioCabinet.settings.portfolio, icon: Image },
  { href: "/cabinet/studio/settings/features", label: UI_TEXT.studioCabinet.settings.features, icon: Sparkles },
  { href: "/cabinet/studio/settings/public", label: UI_TEXT.studioCabinet.settings.publicPage, icon: Share2 },
  { href: "/cabinet/studio/billing", label: UI_TEXT.studioCabinet.settings.billing, icon: CreditCard },
];

// ── Active helpers ───────────────────────────────────────────────────────────

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isSettingsActive(pathname: string): boolean {
  return pathname.startsWith("/cabinet/studio/settings") || pathname === "/cabinet/studio/billing";
}

function isChildActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  studioName: string;
  publicHref: string;
  publicHint?: string | null;
};

// ── Component ────────────────────────────────────────────────────────────────

export function StudioSidebar({ studioName, publicHref, publicHint }: Props) {
  const pathname = usePathname();
  const plan = usePlanFeatures("STUDIO");
  const settingsOpen_ = isSettingsActive(pathname);
  const [settingsOpen, setSettingsOpen] = useState(settingsOpen_);

  return (
    <aside className="flex h-full w-64 flex-col">
      {/* Card-background block */}
      <div className="bg-bg-card">
        {/* Brand */}
        <div className="border-b border-border-subtle px-5 py-4">
          <Link href="/" className="text-base font-bold text-text-main transition hover:text-primary">
            {UI_TEXT.master.topbar.brand}
          </Link>
        </div>

        {/* Studio name badge */}
        <div className="px-4 py-3">
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
        <nav className="px-3 pb-3 pt-1" aria-label="Навигация студии">
          <ul className="space-y-0.5">
            {/* Main nav items */}
            {MAIN_NAV.map((item) => {
              const active = isItemActive(pathname, item);
              const Icon = item.icon;
              const locked = item.featureKey ? !plan.can(item.featureKey) && !plan.loading : false;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={locked ? UI_TEXT.studioCabinet.nav.lockedHint : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-primary/10 text-primary"
                        : locked
                          ? "text-text-sec/50 hover:bg-bg-input hover:text-text-sec"
                          : "text-text-sec hover:bg-bg-input hover:text-text-main"
                    )}
                    aria-label={locked ? `${item.label} — ${UI_TEXT.studioCabinet.nav.lockedHint}` : item.label}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary" : locked ? "text-text-sec/40" : "text-text-sec"
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {locked ? (
                      <LockBadge tooltip={UI_TEXT.studioCabinet.nav.lockedHint} />
                    ) : active ? (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              );
            })}

            {/* Separator */}
            <li className="py-1" aria-hidden>
              <div className="border-t border-border-subtle" />
            </li>

            {/* Settings — collapsible */}
            <li>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isSettingsActive(pathname)
                    ? "text-primary"
                    : "text-text-sec hover:bg-bg-input hover:text-text-main"
                )}
              >
                <Settings
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isSettingsActive(pathname) ? "text-primary" : "text-text-sec"
                  )}
                  aria-hidden
                />
                <span className="flex-1 text-left">{UI_TEXT.studioCabinet.nav.settingsAria}</span>
                <motion.span
                  animate={{ rotate: settingsOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-auto shrink-0"
                >
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {settingsOpen && (
                  <motion.ul
                    key="settings-children"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="ml-7 mt-0.5 overflow-hidden space-y-0.5"
                  >
                    {SETTINGS_CHILDREN.map((child) => {
                      const childActive = isChildActive(pathname, child.href);
                      const ChildIcon = child.icon;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all",
                              childActive
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-text-sec hover:bg-bg-input hover:text-text-main"
                            )}
                          >
                            <ChildIcon
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                childActive ? "text-primary" : "text-text-sec/70"
                              )}
                              aria-hidden
                            />
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          </ul>
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" aria-hidden />

      {/* Public page link */}
      <div className="px-3 pb-4">
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
