"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useCurrentAccount } from "@/features/auth/use-current-account";

type NavItem = {
  label: string;
  href: string;
  icon: (props: { className?: string }) => ReactElement;
};

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

function IconSpark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2 13.5 7.5 19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
    </svg>
  );
}

const NAV_ITEMS_GUEST: NavItem[] = [
  { label: "Главная", href: "/", icon: IconHome },
  { label: "Каталог", href: "/catalog", icon: IconSearch },
  { label: "Запись", href: "/book", icon: IconCalendar },
  { label: "Войти", href: "/login", icon: IconUser },
];

const NAV_ITEMS_CLIENT: NavItem[] = [
  { label: "Главная", href: "/", icon: IconHome },
  { label: "Каталог", href: "/catalog", icon: IconSearch },
  { label: "Записи", href: "/cabinet/bookings", icon: IconCalendar },
  { label: "Профиль", href: "/cabinet/profile", icon: IconUser },
];

const NAV_ITEMS_MASTER: NavItem[] = [
  { label: "Главная", href: "/", icon: IconHome },
  { label: "Клиенты", href: "/cabinet/master/clients", icon: IconUser },
  { label: "Расписание", href: "/cabinet/master/schedule", icon: IconCalendar },
  { label: "Профиль", href: "/cabinet/master/profile", icon: IconSpark },
];

const NAV_ITEMS_STUDIO: NavItem[] = [
  { label: "Главная", href: "/", icon: IconHome },
  { label: "Клиенты", href: "/cabinet/studio/clients", icon: IconUser },
  { label: "Календарь", href: "/cabinet/studio/calendar", icon: IconCalendar },
  { label: "Услуги", href: "/cabinet/studio/services", icon: IconGrid },
];

const NAV_ITEMS_ADMIN: NavItem[] = [
  { label: "Главная", href: "/", icon: IconHome },
  { label: "Админ", href: "/admin", icon: IconGrid },
  { label: "Каталог", href: "/catalog", icon: IconSearch },
  { label: "Профиль", href: "/cabinet/profile", icon: IconUser },
];

export function BottomNav() {
  const pathname = usePathname();
  const account = useCurrentAccount();

  const items = useMemo<NavItem[]>(() => {
    if (!account || account.type === "GUEST") return NAV_ITEMS_GUEST;
    if (account.type === "CLIENT") return NAV_ITEMS_CLIENT;
    if (account.type === "MASTER_SOLO" || account.type === "MASTER_IN_STUDIO") return NAV_ITEMS_MASTER;
    if (account.type === "STUDIO_ADMIN") return NAV_ITEMS_STUDIO;
    if (account.type === "PLATFORM_ADMIN") return NAV_ITEMS_ADMIN;
    return NAV_ITEMS_GUEST;
  }, [account]);

  const hiddenPrefixes = ["/auth", "/login", "/logout", "/book"];
  const isHidden = hiddenPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isHidden) return null;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-bg-card/95 pb-safe pt-2 shadow-card backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-around px-3">
          {items.map((item) => {
            const isActive = pathname === "/" ? item.href === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition ${
                  isActive ? "text-text-main" : "text-text-sec"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}
