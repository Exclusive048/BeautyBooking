"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, User, Scissors, Building2, UserPlus, X, LogOut } from "lucide-react";
import { useMe } from "@/lib/hooks/use-me";
import { useActiveRole, type ActiveRole } from "@/lib/hooks/use-active-role";
import { UI_TEXT } from "@/lib/ui/text";
import { cn } from "@/lib/cn";

const t = UI_TEXT.nav;

type NavItem = {
  label: string;
  href: string;
  icon: (props: { className?: string }) => ReactElement;
};

// ── SVG icons (keep as-is for small bundle) ──────────────────────────────────

function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}
function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}
function IconCalendar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M7 3v3M17 3v3M3 9h18" />
    </svg>
  );
}
function IconUser({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 5.4-6 8-6s6.4 2 8 6" />
    </svg>
  );
}
function IconClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function IconGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconSwitch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 16V4m0 0L3 8m4-4 4 4" />
      <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
    </svg>
  );
}

// ── Tab sets per role ─────────────────────────────────────────────────────────

const NAV_GUEST: NavItem[] = [
  { label: t.home, href: "/", icon: IconHome },
  { label: t.catalog, href: "/catalog", icon: IconSearch },
  { label: t.book, href: "/book", icon: IconCalendar },
  { label: t.loginAction, href: "/login", icon: IconUser },
];

const NAV_CLIENT: NavItem[] = [
  { label: t.home, href: "/", icon: IconHome },
  { label: t.catalog, href: "/catalog", icon: IconSearch },
  { label: t.bookings, href: "/cabinet/bookings", icon: IconCalendar },
  { label: t.profile, href: "/cabinet/profile", icon: IconUser },
];

const NAV_MASTER: NavItem[] = [
  { label: t.home, href: "/cabinet/master/dashboard", icon: IconHome },
  { label: t.bookings, href: "/cabinet/master/bookings", icon: IconCalendar },
  { label: t.schedule, href: "/cabinet/master/schedule", icon: IconClock },
  { label: t.profile, href: "/cabinet/master/profile", icon: IconUser },
];

const NAV_STUDIO: NavItem[] = [
  { label: t.home, href: "/cabinet/studio", icon: IconHome },
  { label: t.calendar, href: "/cabinet/studio/calendar", icon: IconCalendar },
  { label: t.clients, href: "/cabinet/studio/clients", icon: IconUser },
  { label: t.services, href: "/cabinet/studio/settings?tab=services", icon: IconGrid },
];

const NAV_ADMIN: NavItem[] = [
  { label: t.home, href: "/", icon: IconHome },
  { label: t.adminShort, href: "/admin", icon: IconGrid },
  { label: t.catalog, href: "/catalog", icon: IconSearch },
  { label: t.profile, href: "/cabinet/profile", icon: IconUser },
];

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<ActiveRole, string> = {
  CLIENT: t.roleClient,
  MASTER: t.roleMaster,
  STUDIO: t.roleStudio,
};

const ROLE_HOME: Record<ActiveRole, string> = {
  CLIENT: "/cabinet/profile",
  MASTER: "/cabinet/master/dashboard",
  STUDIO: "/cabinet/studio",
};

// ── Role Switcher Drawer ──────────────────────────────────────────────────────

function RoleSwitcherDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { activeRole, setRole, availableRoles, hasMaster, hasStudio } = useActiveRole();
  const router = useRouter();

  const switchTo = (role: ActiveRole) => {
    setRole(role);
    router.push(ROLE_HOME[role]);
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[49] bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={onClose}
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
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border-subtle" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-1">
              <span className="text-sm font-semibold text-text-main">{t.roleSwitcherTitle}</span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-sec hover:text-text-main"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Role list — only shown if 2+ roles */}
            {availableRoles.length > 1 ? (
              <div className="mx-4 mb-4 space-y-1 rounded-2xl border border-border-subtle bg-bg-input/50 p-2">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-sec">
                  {t.activeRole}
                </p>
                {availableRoles.map((role) => {
                  const isActive = role === activeRole;
                  const Icon = role === "CLIENT" ? User : role === "MASTER" ? Scissors : Building2;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => switchTo(role)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-text-sec hover:bg-bg-card hover:text-text-main"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{ROLE_LABELS[role]}</span>
                      {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Add role links */}
            {(!hasMaster || !hasStudio) ? (
              <div className="mx-4 mb-4 space-y-1">
                {!hasMaster ? (
                  <Link
                    href="/cabinet/roles"
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-primary transition-colors hover:bg-primary/5"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" />
                    {t.becomeMasterCta}
                  </Link>
                ) : null}
                {!hasStudio ? (
                  <Link
                    href="/cabinet/roles"
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-primary transition-colors hover:bg-primary/5"
                  >
                    <Building2 className="h-4 w-4 shrink-0" />
                    {t.createStudioCta}
                  </Link>
                ) : null}
              </div>
            ) : null}

            {/* Logout */}
            <div className="mx-4 mb-5 border-t border-border-subtle/60 pt-3">
              <a
                href="/logout"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {UI_TEXT.auth.logout}
              </a>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

// ── Main BottomNav ────────────────────────────────────────────────────────────

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useMe();
  const { activeRole, availableRoles, hydrated } = useActiveRole();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isAdmin = user?.roles?.includes("ADMIN") || user?.roles?.includes("SUPERADMIN");
  const isGuest = !user;
  const isLoggedIn = Boolean(user);

  const items = useMemo<NavItem[]>(() => {
    if (isAdmin) return NAV_ADMIN;
    if (isGuest) return NAV_GUEST;
    if (!hydrated) return NAV_CLIENT; // default while hydrating

    if (activeRole === "MASTER") return NAV_MASTER;
    if (activeRole === "STUDIO") return NAV_STUDIO;
    return NAV_CLIENT;
  }, [isAdmin, isGuest, hydrated, activeRole]);

  const hiddenPrefixes = ["/auth", "/login", "/logout", "/book"];
  const isHidden = hiddenPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // Inside master/studio cabinets their own bottom navs are rendered;
  // hide the global one so they don't overlap.
  const isInsideMaster = pathname.startsWith("/cabinet/master");
  const isInsideStudio = pathname.startsWith("/cabinet/studio");
  if (isHidden || isInsideMaster || isInsideStudio) return null;

  const showSwitcher = isLoggedIn && availableRoles.length > 1;

  return (
    <>
      <RoleSwitcherDrawer open={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-bg-card/95 shadow-card backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-around px-3 pt-2 pb-1">
          {items.map((item) => {
            const itemPath = item.href.split("?")[0] ?? item.href;
            const isActive =
              pathname === "/" ? itemPath === "/" : pathname.startsWith(itemPath) && itemPath !== "/";
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-[56px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] transition",
                  isActive ? "text-primary" : "text-text-sec"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* Role switcher tab — only when user has multiple roles */}
          {showSwitcher ? (
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="flex min-w-[56px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] text-text-sec transition hover:text-text-main"
              aria-label={t.switchRole}
            >
              <IconSwitch className="h-5 w-5" />
              <span className="font-medium">{ROLE_LABELS[activeRole]}</span>
            </button>
          ) : null}
        </div>
      </nav>
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}
