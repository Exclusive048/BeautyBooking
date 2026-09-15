"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Heart, Send, User, Star } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { UI_TEXT } from "@/lib/ui/text";

const TABS = [
  { label: UI_TEXT.clientCabinet.nav.bookings, href: "/cabinet/bookings", icon: Calendar },
  { label: UI_TEXT.clientCabinet.nav.messages, href: "/cabinet/messages", icon: Send },
  { label: UI_TEXT.clientCabinet.nav.favorites, href: "/cabinet/favorites", icon: Heart },
  { label: UI_TEXT.clientCabinet.nav.reviews, href: "/cabinet/reviews", icon: Star },
  { label: UI_TEXT.clientCabinet.nav.profile, href: "/cabinet/profile", icon: User },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CabinetBottomNav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <>
    <nav aria-label={UI_TEXT.a11y.cabinetSections} className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      {/* Blur backdrop */}
      <div className="absolute inset-0 border-t border-border-subtle/60 bg-bg-card/90 backdrop-blur-xl" />
      {/* Safe area padding */}
      {/* PWA-UX-BATCH-01: инсет минус 10px, строка вкладок ниже — см. MasterBottomNav. */}
      <div className="relative flex items-stretch justify-around pb-[max(0px,calc(env(safe-area-inset-bottom,0px)-10px))]">
        {TABS.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname ?? "/", href);
          return (
            <Link
              key={href}
              href={href}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 pb-1 pt-1.5 text-center"
            >
              {active ? (
                <motion.span
                  layoutId="bottom-nav-indicator"
                  className="absolute inset-x-1 top-0 h-[2px] rounded-full bg-gradient-to-r from-primary to-primary-magenta"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
                />
              ) : null}
              <Icon
                className={`h-5 w-5 shrink-0 transition-colors duration-200 ${
                  active ? "text-accent-text" : "text-text-sec"
                }`}
              />
              <span
                className={`truncate text-[10px] font-medium leading-none transition-colors duration-200 ${
                  active ? "text-accent-text" : "text-text-sec"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
    {/* FIX-07 (QA-119): in-flow clearance spacer so page content (esp. the last
        booking card's action row, incl. the destructive "Отменить") scrolls
        clear of the fixed bottom-nav on mobile. Matches the master/studio/global
        bottom-navs, which all render this spacer — the client nav was the only
        one missing it. `lg:hidden` → no desktop dead space (nav is mobile-only). */}
    <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}
