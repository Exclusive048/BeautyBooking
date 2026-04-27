"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserCircle,
  MoreHorizontal,
  Star,
  BarChart3,
  Settings,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const tStudio = UI_TEXT.studioCabinet.nav;
const tMore = UI_TEXT.master.bookingsPage;

type TabItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const TABS: TabItem[] = [
  { href: "/cabinet/studio", label: tStudio.home, icon: LayoutDashboard, exact: true },
  { href: "/cabinet/studio/calendar", label: tStudio.calendar, icon: CalendarDays },
  { href: "/cabinet/studio/team", label: tStudio.team, icon: Users },
  { href: "/cabinet/studio/clients", label: tStudio.clients, icon: UserCircle },
];

const MORE_ITEMS = [
  { href: "/cabinet/studio/reviews", label: tStudio.reviews, icon: Star },
  { href: "/cabinet/studio/analytics", label: tStudio.analytics, icon: BarChart3 },
  { href: "/cabinet/studio/finance", label: tStudio.finance, icon: Wallet },
  { href: "/cabinet/studio/settings", label: tStudio.settingsAria, icon: Settings },
];

const MORE_PATHS = MORE_ITEMS.map((item) => item.href).concat([
  "/cabinet/studio/billing",
  "/cabinet/studio/services",
]);

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
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* More drawer */}
      <AnimatePresence>
        {moreOpen ? (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[49] bg-black/40 backdrop-blur-[2px] lg:hidden"
              onClick={() => setMoreOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              key="drawer"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 340 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] border-t border-border-subtle bg-bg-card shadow-2xl lg:hidden"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-border-subtle" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3 pt-1">
                <span className="text-sm font-semibold text-text-main">{tMore.moreDrawerTitle}</span>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="rounded-lg p-1.5 text-text-sec hover:text-text-main"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 px-4 pb-6 pt-1">
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-text-sec hover:bg-bg-input"
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                      <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* Tab bar */}
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
                    <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-text-sec")} aria-hidden />
                    <span className={cn("text-[10px] font-medium", active ? "text-primary" : "text-text-sec")}>
                      {tab.label}
                    </span>
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex w-full flex-col items-center gap-0.5 px-1 py-2.5 transition-colors"
                aria-expanded={moreOpen}
              >
                <MoreHorizontal
                  className={cn("h-5 w-5", moreActive || moreOpen ? "text-primary" : "text-text-sec")}
                  aria-hidden
                />
                <span className={cn("text-[10px] font-medium", moreActive || moreOpen ? "text-primary" : "text-text-sec")}>
                  {UI_TEXT.master.topbar.nav.more}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}
