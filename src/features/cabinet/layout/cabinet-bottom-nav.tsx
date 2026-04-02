"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, User, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/ui/text";

const TABS = [
  { label: UI_TEXT.clientCabinet.nav.home, href: "/cabinet", icon: LayoutDashboard, exact: true },
  { label: UI_TEXT.clientCabinet.nav.bookings, href: "/cabinet/bookings", icon: Calendar },
  { label: UI_TEXT.clientCabinet.nav.profile, href: "/cabinet/profile", icon: User },
  { label: UI_TEXT.clientCabinet.nav.settings, href: "/cabinet/settings", icon: Settings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CabinetBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      {/* Blur backdrop */}
      <div className="absolute inset-0 border-t border-border-subtle/60 bg-bg-card/90 backdrop-blur-xl" />
      {/* Safe area padding */}
      <div className="relative flex items-stretch justify-around pb-[env(safe-area-inset-bottom,0px)]">
        {TABS.map(({ label, href, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-2.5 text-center"
            >
              {active ? (
                <motion.span
                  layoutId="bottom-nav-indicator"
                  className="absolute inset-x-1 top-0 h-[2px] rounded-full bg-gradient-to-r from-primary to-primary-magenta"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              ) : null}
              <Icon
                className={`h-5 w-5 shrink-0 transition-colors duration-200 ${
                  active ? "text-primary" : "text-text-sec"
                }`}
              />
              <span
                className={`truncate text-[10px] font-medium leading-none transition-colors duration-200 ${
                  active ? "text-primary" : "text-text-sec"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
