"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Clock,
  Users,
  Star,
  BarChart3,
  Settings,
  CreditCard,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Share2,
  User,
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
  featureKey?: "analytics_dashboard";
};

// ── Nav items ────────────────────────────────────────────────────────────────

const MAIN_NAV: NavItem[] = [
  { href: "/cabinet/master/dashboard", label: UI_TEXT.master.topbar.nav.home, icon: LayoutDashboard, exact: true },
  { href: "/cabinet/master/schedule", label: UI_TEXT.master.topbar.nav.schedule, icon: Clock },
  { href: "/cabinet/master/clients", label: UI_TEXT.master.topbar.nav.clients, icon: Users },
  { href: "/cabinet/master/reviews", label: UI_TEXT.master.topbar.nav.reviews, icon: Star },
  { href: "/cabinet/master/model-offers", label: UI_TEXT.master.topbar.nav.models, icon: Sparkles },
  {
    href: "/cabinet/master/analytics",
    label: UI_TEXT.master.topbar.nav.analytics,
    icon: BarChart3,
    featureKey: "analytics_dashboard",
  },
];

const SETTINGS_CHILDREN: SettingsChild[] = [
  { href: "/cabinet/master/profile", label: UI_TEXT.master.sidebar.settingsProfile, icon: User },
  { href: "/cabinet/master/settings/features", label: UI_TEXT.master.sidebar.settingsFeatures, icon: Sparkles },
  { href: "/cabinet/master/settings/public", label: UI_TEXT.master.sidebar.settingsPublic, icon: Share2 },
  { href: "/cabinet/master/billing", label: UI_TEXT.master.sidebar.settingsBilling, icon: CreditCard },
];

// ── Active helpers ───────────────────────────────────────────────────────────

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isSettingsActive(pathname: string): boolean {
  return (
    pathname.startsWith("/cabinet/master/settings") ||
    pathname === "/cabinet/master/billing" ||
    pathname === "/cabinet/master/profile"
  );
}

function isChildActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  ratingLabel: string;
  publicUsername?: string | null;
};

// ── Component ────────────────────────────────────────────────────────────────

export function MasterSidebar({ ratingLabel, publicUsername }: Props) {
  const pathname = usePathname();
  const plan = usePlanFeatures("MASTER");
  const t = UI_TEXT.master;
  const settingsOpen_ = isSettingsActive(pathname);
  const [settingsOpen, setSettingsOpen] = useState(settingsOpen_);

  return (
    <aside className="flex h-full w-64 flex-col">
      {/* Card-background block */}
      <div className="bg-bg-card">
        {/* Brand */}
        <div className="border-b border-border-subtle px-5 py-4">
          <Link href="/" className="text-base font-bold text-text-main transition hover:text-primary">
            {t.topbar.brand}
          </Link>
        </div>

        {/* Rating badge */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2">
            <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
            <span className="text-sm font-medium text-text-main">{ratingLabel}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-3 pb-3 pt-1" aria-label="Навигация кабинета">
          <ul className="space-y-0.5">
            {/* Main nav items */}
            {MAIN_NAV.map((item) => {
              const active = isItemActive(pathname, item);
              const Icon = item.icon;
              const locked = item.featureKey
                ? !plan.can(item.featureKey) && !plan.loading
                : false;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={locked ? t.sidebar.lockedHint : undefined}
                    aria-label={locked ? `${item.label} — ${t.sidebar.lockedHint}` : item.label}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-primary/10 text-primary"
                        : locked
                          ? "text-text-sec/50 hover:bg-bg-input hover:text-text-sec"
                          : "text-text-sec hover:bg-bg-input hover:text-text-main"
                    )}
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
                      <LockBadge tooltip={t.sidebar.lockedHint} />
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
                <span className="flex-1 text-left">{t.sidebar.settings}</span>
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
                    className="ml-7 mt-0.5 space-y-0.5 overflow-hidden"
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

      {/* Transparent spacer */}
      <div className="flex-1" aria-hidden />

      {/* My page link — pinned to bottom */}
      {publicUsername ? (
        <div className="px-3 pb-4">
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
